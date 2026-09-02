import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import type { Author, Comment, Prisma } from '@prisma/client';

import { PrismaService } from '../../core/prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { AttachmentType } from '../attachments/enums/attachment-type.enum';
import { AuthorsService } from '../authors/authors.service';
import { CaptchaService } from '../captcha/captcha.service';
import { SanitizerService } from '../sanitizer/sanitizer.service';
import {
	ROOT_COMMENTS_CACHE_PREFIX,
	ROOT_COMMENTS_CACHE_TTL_SECONDS,
	ROOT_COMMENTS_PER_PAGE,
} from '../../shared/constants';
import { SortOrder } from '../../shared/enums/sort-order.enum';
import type { CreateCommentInput } from './inputs/create-comment.input';
import type { RootCommentsArgs } from './inputs/root-comments.args';
import { RootCommentSortField } from './enums/root-comment-sort-field.enum';
import type { CommentModel } from './models/comment.model';
import type { RootCommentsPage } from './models/root-comments-page.model';
import type { ThreadCommentModel } from './models/thread-comment.model';

type CommentWithRelations = Comment & {
	author: Author;
	_count: { replies: number };
};

/** One flat row of the recursive-CTE thread query. */
interface ThreadRow {
	id: string;
	text: string;
	parentId: string | null;
	createdAt: Date;
	depth: number;
	authorId: string;
	authorUsername: string;
	authorEmail: string;
	authorHomepage: string | null;
	authorCreatedAt: Date;
	attachmentId: string | null;
	attachmentType: string | null;
	attachmentUrl: string | null;
	attachmentOriginalName: string | null;
	attachmentSize: number | null;
	attachmentProcessedAt: Date | null;
}

@Injectable()
export class CommentsService {
	public constructor(
		private readonly prismaService: PrismaService,
		private readonly cacheService: CacheService,
		private readonly authorsService: AuthorsService,
		private readonly captchaService: CaptchaService,
		private readonly sanitizerService: SanitizerService,
	) {}

	// ─── Reads ──────────────────────────────────────────────────────────────

	/**
	 * One page of top-level comments (`parentId IS NULL`), 25 per page, sorted by
	 * username / email / date in either direction. Each item carries a
	 * `repliesCount` (direct replies, non-hidden) but no nested replies.
	 * Result is cached in Redis for a short TTL, keyed by page + sort.
	 */
	public async getRootComments(
		args: RootCommentsArgs,
	): Promise<RootCommentsPage> {
		const page = args.page ?? 1;
		const sortBy = args.sortBy ?? RootCommentSortField.CREATED_AT;
		const sortOrder = args.sortOrder ?? SortOrder.DESC;

		const cacheKey = `${ROOT_COMMENTS_CACHE_PREFIX}${page}:${sortBy}:${sortOrder}`;
		const cached =
			await this.cacheService.getJson<RootCommentsPage>(cacheKey);
		if (cached) {
			// JSON round-trip turned the Date fields into ISO strings — the
			// GraphQL DateTime scalar needs real Dates back.
			return CommentsService.reviveRootPage(cached);
		}

		const where: Prisma.CommentWhereInput = {
			parentId: null,
			isHidden: false,
		};

		const [rows, totalCount] = await this.prismaService.$transaction([
			this.prismaService.comment.findMany({
				where,
				orderBy: CommentsService.buildRootOrderBy(sortBy, sortOrder),
				skip: (page - 1) * ROOT_COMMENTS_PER_PAGE,
				take: ROOT_COMMENTS_PER_PAGE,
				include: {
					author: true,
					_count: {
						select: { replies: { where: { isHidden: false } } },
					},
				},
			}),
			this.prismaService.comment.count({ where }),
		]);

		const result: RootCommentsPage = {
			items: rows.map(row => CommentsService.toModel(row)),
			totalCount,
			page,
			totalPages: Math.max(
				1,
				Math.ceil(totalCount / ROOT_COMMENTS_PER_PAGE),
			),
		};

		await this.cacheService.setJson(
			cacheKey,
			result,
			ROOT_COMMENTS_CACHE_TTL_SECONDS,
		);
		return result;
	}

	/**
	 * The full thread rooted at `rootId`: the root comment plus every descendant
	 * at any depth, fetched in ONE round-trip via a recursive CTE, reassembled
	 * into a tree with replies ordered newest-first at every level.
	 *
	 * `rootId` is passed to Postgres as a bound parameter (never concatenated),
	 * so SQL metacharacters in it are harmless — an unknown / malformed id just
	 * yields an empty result and a clean 404.
	 */
	public async getCommentThread(rootId: string): Promise<ThreadCommentModel> {
		// The anchor requires `parentId IS NULL`, so asking for a thread by a
		// reply's id returns nothing → same 404 as an unknown id.
		const rows = await this.prismaService.$queryRaw<ThreadRow[]>`
			WITH RECURSIVE thread AS (
				SELECT
					c."id", c."text", c."parentId", c."authorId",
					c."createdAt", c."isHidden", 0 AS depth
				FROM "comments" c
				WHERE c."id" = ${rootId} AND c."parentId" IS NULL

				UNION ALL

				SELECT
					child."id", child."text", child."parentId", child."authorId",
					child."createdAt", child."isHidden", parent.depth + 1
				FROM "comments" child
				INNER JOIN thread parent ON child."parentId" = parent."id"
			)
			SELECT
				t."id", t."text", t."parentId", t."createdAt", t.depth,
				a."id"          AS "authorId",
				a."username"    AS "authorUsername",
				a."email"       AS "authorEmail",
				a."homepage"    AS "authorHomepage",
				a."createdAt"   AS "authorCreatedAt",
				att."id"           AS "attachmentId",
				att."type"::text   AS "attachmentType",
				att."url"          AS "attachmentUrl",
				att."originalName" AS "attachmentOriginalName",
				att."size"         AS "attachmentSize",
				att."processedAt"  AS "attachmentProcessedAt"
			FROM thread t
			INNER JOIN "authors" a ON a."id" = t."authorId"
			LEFT JOIN "attachments" att ON att."commentId" = t."id"
			ORDER BY t.depth ASC, t."createdAt" DESC
		`;

		if (rows.length === 0) {
			throw new NotFoundException(
				`Comment thread "${rootId}" was not found. A thread can only be ` +
					`requested by the id of a top-level comment.`,
			);
		}

		return CommentsService.buildThreadTree(rows);
	}

	// ─── Write ──────────────────────────────────────────────────────────────

	/**
	 * Create a root comment or a reply.
	 *
	 * Order: verify CAPTCHA first (fail fast, one-time token) → sanitize/validate
	 * the body → check the parent (and attachment) exist → find-or-create the
	 * author → create the comment, linking the attachment in the same
	 * transaction. Field-level validation (username regex, email, URL, UUIDs)
	 * has already run in the global `ValidationPipe` before we get here.
	 */
	public async createComment(
		input: CreateCommentInput,
	): Promise<CommentModel> {
		const solved = await this.captchaService.verify(
			input.captchaToken,
			input.captchaAnswer,
		);
		if (!solved) {
			throw new BadRequestException(
				'CAPTCHA verification failed. Reload the challenge and try again.',
			);
		}

		const text = this.sanitizerService.sanitize(input.text);
		if (text.length === 0) {
			throw new BadRequestException('Comment text is required.');
		}

		if (input.parentId) {
			await this.assertParentExists(input.parentId);
		}
		if (input.attachmentId) {
			await this.assertAttachmentLinkable(input.attachmentId);
		}

		const author = await this.authorsService.findOrCreate({
			username: input.username,
			email: input.email,
			homepage: input.homepage,
		});

		const comment = await this.prismaService.$transaction(async tx => {
			const created = await tx.comment.create({
				data: {
					text,
					parentId: input.parentId ?? null,
					authorId: author.id,
				},
				include: {
					author: true,
					_count: { select: { replies: true } },
				},
			});

			if (input.attachmentId) {
				await tx.attachment.update({
					where: { id: input.attachmentId },
					data: { commentId: created.id },
				});
			}

			return created;
		});

		// Any new comment changes the root list — a new root adds a row and bumps
		// totalCount; a reply bumps its root's repliesCount. Simplest correct
		// move: drop the whole cached list.
		await this.cacheService.delByPattern(`${ROOT_COMMENTS_CACHE_PREFIX}*`);

		return CommentsService.toModel(comment);
	}

	// ─── Helpers ────────────────────────────────────────────────────────────

	private async assertParentExists(parentId: string): Promise<void> {
		const parent = await this.prismaService.comment.findUnique({
			where: { id: parentId },
			select: { id: true },
		});
		if (!parent) {
			throw new NotFoundException(
				`Parent comment "${parentId}" was not found.`,
			);
		}
	}

	private async assertAttachmentLinkable(
		attachmentId: string,
	): Promise<void> {
		const attachment = await this.prismaService.attachment.findUnique({
			where: { id: attachmentId },
			select: { id: true, commentId: true },
		});
		if (!attachment) {
			throw new NotFoundException(
				`Attachment "${attachmentId}" was not found.`,
			);
		}
		if (attachment.commentId) {
			throw new BadRequestException(
				'That attachment is already linked to another comment.',
			);
		}
	}

	private static reviveRootPage(page: RootCommentsPage): RootCommentsPage {
		return {
			...page,
			items: page.items.map(item => ({
				...item,
				createdAt: new Date(item.createdAt),
				author: {
					...item.author,
					createdAt: new Date(item.author.createdAt),
				},
			})),
		};
	}

	private static buildRootOrderBy(
		sortBy: RootCommentSortField,
		sortOrder: SortOrder,
	): Prisma.CommentOrderByWithRelationInput {
		switch (sortBy) {
			case RootCommentSortField.USERNAME:
				return { author: { username: sortOrder } };
			case RootCommentSortField.EMAIL:
				return { author: { email: sortOrder } };
			case RootCommentSortField.CREATED_AT:
			default:
				return { createdAt: sortOrder };
		}
	}

	private static toModel(comment: CommentWithRelations): CommentModel {
		return {
			id: comment.id,
			text: comment.text,
			parentId: comment.parentId,
			author: comment.author,
			repliesCount: comment._count.replies,
			createdAt: comment.createdAt,
		};
	}

	private static buildThreadTree(rows: ThreadRow[]): ThreadCommentModel {
		const nodes = new Map<string, ThreadCommentModel>();

		for (const row of rows) {
			nodes.set(row.id, {
				id: row.id,
				text: row.text,
				parentId: row.parentId,
				createdAt: row.createdAt,
				author: {
					id: row.authorId,
					username: row.authorUsername,
					email: row.authorEmail,
					homepage: row.authorHomepage,
					createdAt: row.authorCreatedAt,
				},
				attachment: row.attachmentId
					? {
							id: row.attachmentId,
							type: row.attachmentType as AttachmentType,
							url: row.attachmentUrl as string,
							originalName: row.attachmentOriginalName as string,
							size: Number(row.attachmentSize),
							processedAt: row.attachmentProcessedAt,
						}
					: null,
				repliesCount: 0,
				replies: [],
			});
		}

		let root: ThreadCommentModel | undefined;
		for (const row of rows) {
			const node = nodes.get(row.id)!;
			const parent = row.parentId ? nodes.get(row.parentId) : undefined;
			if (parent) {
				parent.replies.push(node);
			} else if (row.parentId === null) {
				root = node;
			}
		}

		// SQL already sorted by (depth ASC, createdAt DESC); make the per-level
		// LIFO order explicit and set the counts.
		for (const node of nodes.values()) {
			node.replies.sort(
				(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
			);
			node.repliesCount = node.replies.length;
		}

		// The anchor guarantees exactly one depth-0 row.
		return root!;
	}
}
