import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { AuthorsService } from '../authors/authors.service';
import { CaptchaService } from '../captcha/captcha.service';
import { SanitizerService } from '../sanitizer/sanitizer.service';
import { CommentsGateway } from '../gateway/comments.gateway';
import { SortOrder } from '../../shared/enums/sort-order.enum';
import { RootCommentSortField } from './enums/root-comment-sort-field.enum';
import {
	ROOT_COMMENTS_CACHE_PREFIX,
	ROOT_COMMENTS_PER_PAGE,
} from '../../shared/constants';
import type { CreateCommentInput } from './inputs/create-comment.input';
import type { RootCommentsArgs } from './inputs/root-comments.args';

const baseInput = (): CreateCommentInput => ({
	username: 'alice',
	email: 'alice@example.com',
	text: '<strong>hi</strong>',
	captchaToken: 'tok',
	captchaAnswer: 'answer',
});

const author = (
	over: Partial<{ id: string; username: string; email: string }> = {},
) => ({
	id: 'author-1',
	username: 'alice',
	email: 'alice@example.com',
	homepage: null,
	createdAt: new Date('2026-01-01T00:00:00Z'),
	...over,
});

const rootRow = (over: Record<string, unknown> = {}) => ({
	id: 'c1',
	text: 'hello',
	parentId: null,
	authorId: 'author-1',
	createdAt: new Date('2026-01-02T00:00:00Z'),
	author: author(),
	_count: { replies: 3 },
	...over,
});

describe('CommentsService', () => {
	let prisma: {
		comment: {
			findUnique: jest.Mock;
			findMany: jest.Mock;
			count: jest.Mock;
			create: jest.Mock;
			update: jest.Mock;
		};
		attachment: { findUnique: jest.Mock; update: jest.Mock };
		$transaction: jest.Mock;
		$queryRaw: jest.Mock;
	};
	type TxCallback = (tx: unknown) => unknown;
	let cache: {
		getJson: jest.Mock;
		setJson: jest.Mock;
		delByPattern: jest.Mock;
	};
	let authors: { findOrCreate: jest.Mock };
	let captcha: { verify: jest.Mock };
	let sanitizer: { sanitize: jest.Mock };
	let gateway: { emitCommentCreated: jest.Mock };
	let service: CommentsService;

	beforeEach(() => {
		prisma = {
			comment: {
				findUnique: jest.fn(),
				findMany: jest.fn(),
				count: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
			},
			attachment: { findUnique: jest.fn(), update: jest.fn() },
			$transaction: jest.fn((arg: unknown[] | TxCallback) =>
				Array.isArray(arg) ? Promise.all(arg) : arg(prisma),
			),
			$queryRaw: jest.fn(),
		};
		cache = {
			getJson: jest.fn().mockResolvedValue(null),
			setJson: jest.fn().mockResolvedValue(undefined),
			delByPattern: jest.fn().mockResolvedValue(0),
		};
		authors = {
			findOrCreate: jest.fn().mockResolvedValue(author()),
		};
		captcha = { verify: jest.fn().mockResolvedValue(true) };
		sanitizer = { sanitize: jest.fn((t: string) => t) };
		gateway = { emitCommentCreated: jest.fn() };

		prisma.comment.create.mockResolvedValue({
			...rootRow({ id: 'comment-1', _count: { replies: 0 } }),
		});

		service = new CommentsService(
			prisma as unknown as PrismaService,
			cache as unknown as CacheService,
			authors as unknown as AuthorsService,
			captcha as unknown as CaptchaService,
			sanitizer as unknown as SanitizerService,
			gateway as unknown as CommentsGateway,
		);
	});

	// ─── createComment ──────────────────────────────────────────────────────

	describe('createComment', () => {
		it('creates a comment on the happy path and busts the root-list cache', async () => {
			const result = await service.createComment(baseInput());

			expect(captcha.verify).toHaveBeenCalledWith('tok', 'answer');
			expect(sanitizer.sanitize).toHaveBeenCalledWith(
				'<strong>hi</strong>',
			);
			expect(authors.findOrCreate).toHaveBeenCalledWith({
				username: 'alice',
				email: 'alice@example.com',
				homepage: undefined,
			});
			expect(prisma.comment.create).toHaveBeenCalled();
			expect(cache.delByPattern).toHaveBeenCalledWith(
				`${ROOT_COMMENTS_CACHE_PREFIX}*`,
			);
			expect(result.id).toBe('comment-1');
			expect(result.repliesCount).toBe(0);
		});

		it('broadcasts the new comment over the gateway', async () => {
			const result = await service.createComment(baseInput());
			expect(gateway.emitCommentCreated).toHaveBeenCalledWith(result);
		});

		it('fails fast on a bad CAPTCHA and never touches the DB or cache', async () => {
			captcha.verify.mockResolvedValue(false);

			await expect(
				service.createComment(baseInput()),
			).rejects.toBeInstanceOf(BadRequestException);
			expect(sanitizer.sanitize).not.toHaveBeenCalled();
			expect(authors.findOrCreate).not.toHaveBeenCalled();
			expect(prisma.comment.create).not.toHaveBeenCalled();
			expect(cache.delByPattern).not.toHaveBeenCalled();
			expect(gateway.emitCommentCreated).not.toHaveBeenCalled();
		});

		it('rejects a reply to a non-existent parent', async () => {
			prisma.comment.findUnique.mockResolvedValue(null);

			await expect(
				service.createComment({
					...baseInput(),
					parentId: 'missing-id',
				}),
			).rejects.toBeInstanceOf(NotFoundException);
			expect(prisma.comment.create).not.toHaveBeenCalled();
		});

		it('accepts a reply when the parent exists', async () => {
			prisma.comment.findUnique.mockResolvedValue({ id: 'parent-1' });

			await service.createComment({
				...baseInput(),
				parentId: 'parent-1',
			});

			const [createArg] = prisma.comment.create.mock.calls.at(0) as [
				{ data: { parentId: string | null; authorId: string } },
			];
			expect(createArg.data.parentId).toBe('parent-1');
			expect(createArg.data.authorId).toBe('author-1');
		});

		it('propagates a sanitizer rejection', async () => {
			sanitizer.sanitize.mockImplementation(() => {
				throw new BadRequestException('bad markup');
			});

			await expect(service.createComment(baseInput())).rejects.toThrow(
				'bad markup',
			);
			expect(prisma.comment.create).not.toHaveBeenCalled();
		});
	});

	// ─── hideComment ────────────────────────────────────────────────────────

	describe('hideComment', () => {
		it('sets isHidden, busts the cache, returns the model', async () => {
			prisma.comment.findUnique.mockResolvedValue({ id: 'c1' });
			prisma.comment.update.mockResolvedValue(
				rootRow({ id: 'c1', isHidden: true, _count: { replies: 0 } }),
			);

			const result = await service.hideComment('c1');

			const [updateArg] = prisma.comment.update.mock.calls.at(0) as [
				{ where: { id: string }; data: { isHidden: boolean } },
			];
			expect(updateArg.where.id).toBe('c1');
			expect(updateArg.data.isHidden).toBe(true);
			expect(cache.delByPattern).toHaveBeenCalledWith(
				`${ROOT_COMMENTS_CACHE_PREFIX}*`,
			);
			expect(result.id).toBe('c1');
		});

		it('404s for an unknown comment id', async () => {
			prisma.comment.findUnique.mockResolvedValue(null);
			await expect(service.hideComment('nope')).rejects.toBeInstanceOf(
				NotFoundException,
			);
			expect(prisma.comment.update).not.toHaveBeenCalled();
		});
	});

	// ─── getRootComments ────────────────────────────────────────────────────

	describe('getRootComments', () => {
		const args = (
			over: Partial<RootCommentsArgs> = {},
		): RootCommentsArgs => ({
			page: 1,
			sortBy: RootCommentSortField.CREATED_AT,
			sortOrder: SortOrder.DESC,
			...over,
		});

		beforeEach(() => {
			prisma.comment.findMany.mockResolvedValue([
				rootRow({ id: 'a', _count: { replies: 2 } }),
				rootRow({ id: 'b', _count: { replies: 0 } }),
			]);
			prisma.comment.count.mockResolvedValue(2);
		});

		it('defaults to LIFO: parentId null, isHidden false, createdAt desc, page 1', async () => {
			await service.getRootComments(args());

			const [findArg] = prisma.comment.findMany.mock.calls.at(0) as [
				{
					where: Record<string, unknown>;
					orderBy: unknown;
					skip: number;
					take: number;
				},
			];
			expect(findArg.where).toEqual({ parentId: null, isHidden: false });
			expect(findArg.orderBy).toEqual({ createdAt: 'desc' });
			expect(findArg.skip).toBe(0);
			expect(findArg.take).toBe(ROOT_COMMENTS_PER_PAGE);
		});

		it.each([
			[
				RootCommentSortField.USERNAME,
				SortOrder.ASC,
				{ author: { username: 'asc' } },
			],
			[
				RootCommentSortField.USERNAME,
				SortOrder.DESC,
				{ author: { username: 'desc' } },
			],
			[
				RootCommentSortField.EMAIL,
				SortOrder.ASC,
				{ author: { email: 'asc' } },
			],
			[
				RootCommentSortField.EMAIL,
				SortOrder.DESC,
				{ author: { email: 'desc' } },
			],
			[
				RootCommentSortField.CREATED_AT,
				SortOrder.ASC,
				{ createdAt: 'asc' },
			],
			[
				RootCommentSortField.CREATED_AT,
				SortOrder.DESC,
				{ createdAt: 'desc' },
			],
		])('sorts by %s %s', async (sortBy, sortOrder, expected) => {
			await service.getRootComments(args({ sortBy, sortOrder }));
			const [findArg] = prisma.comment.findMany.mock.calls.at(0) as [
				{ orderBy: unknown },
			];
			expect(findArg.orderBy).toEqual(expected);
		});

		it('paginates: page 3 skips 50', async () => {
			await service.getRootComments(args({ page: 3 }));
			const [findArg] = prisma.comment.findMany.mock.calls.at(0) as [
				{ skip: number },
			];
			expect(findArg.skip).toBe(2 * ROOT_COMMENTS_PER_PAGE);
		});

		it('maps _count.replies to repliesCount and computes totalPages', async () => {
			prisma.comment.count.mockResolvedValue(30);
			const page = await service.getRootComments(args());

			expect(page.items.map(i => i.repliesCount)).toEqual([2, 0]);
			expect(page.totalCount).toBe(30);
			expect(page.totalPages).toBe(2); // ceil(30 / 25)
			expect(page.page).toBe(1);
		});

		it('on a cache MISS: queries the DB then writes the cache', async () => {
			cache.getJson.mockResolvedValue(null);

			await service.getRootComments(
				args({ page: 2, sortBy: RootCommentSortField.EMAIL }),
			);

			expect(prisma.comment.findMany).toHaveBeenCalled();
			expect(cache.setJson).toHaveBeenCalledWith(
				`${ROOT_COMMENTS_CACHE_PREFIX}2:EMAIL:desc`,
				expect.anything(),
				expect.any(Number),
			);
		});

		it('on a cache HIT: returns cached data (revived Dates) without touching the DB', async () => {
			cache.getJson.mockResolvedValue({
				items: [
					{
						id: 'cached',
						text: 'x',
						parentId: null,
						repliesCount: 5,
						createdAt: '2026-02-02T00:00:00.000Z',
						author: {
							id: 'a',
							username: 'u',
							email: 'e',
							homepage: null,
							createdAt: '2026-02-01T00:00:00.000Z',
						},
					},
				],
				totalCount: 1,
				page: 1,
				totalPages: 1,
			});

			const page = await service.getRootComments(args());

			expect(prisma.comment.findMany).not.toHaveBeenCalled();
			expect(cache.setJson).not.toHaveBeenCalled();
			expect(page.items[0].createdAt).toBeInstanceOf(Date);
			expect(page.items[0].author.createdAt).toBeInstanceOf(Date);
		});
	});

	// ─── getCommentThread ───────────────────────────────────────────────────

	describe('getCommentThread', () => {
		const flat = (
			id: string,
			parentId: string | null,
			depth: number,
			createdAt: string,
			extra: Record<string, unknown> = {},
		) => ({
			id,
			text: `text-${id}`,
			parentId,
			createdAt: new Date(createdAt),
			depth,
			authorId: `au-${id}`,
			authorUsername: `user-${id}`,
			authorEmail: `${id}@e.com`,
			authorHomepage: null,
			authorIsBanned: false,
			authorCreatedAt: new Date(createdAt),
			attachmentId: null,
			attachmentType: null,
			attachmentUrl: null,
			attachmentOriginalName: null,
			attachmentSize: null,
			attachmentProcessedAt: null,
			...extra,
		});

		it('returns a lone root with no replies', async () => {
			prisma.$queryRaw.mockResolvedValue([
				flat('root', null, 0, '2026-01-01T00:00:00Z'),
			]);

			const tree = await service.getCommentThread('root');

			expect(tree.id).toBe('root');
			expect(tree.replies).toEqual([]);
			expect(tree.repliesCount).toBe(0);
			expect(tree.author.username).toBe('user-root');
		});

		it('passes rootId as a bound parameter, never concatenated into the SQL', async () => {
			prisma.$queryRaw.mockResolvedValue([
				flat('root', null, 0, '2026-01-01T00:00:00Z'),
			]);
			const dangerous = "'; DROP TABLE comments; --";

			await service.getCommentThread(dangerous);

			const call = prisma.$queryRaw.mock.calls.at(0) as unknown[];
			const strings = call[0] as string[] & { raw?: unknown };
			expect(strings.raw).toBeDefined(); // it's a tagged-template call
			expect(call.slice(1)).toContain(dangerous); // value is a parameter
			expect(strings.join('')).not.toContain(dangerous); // not in the query text
		});

		it('reassembles a 3-level tree with LIFO order at every level', async () => {
			// root
			//  ├─ b (newer)         ← should come first
			//  └─ a (older)
			//       └─ a1
			//            └─ a1x
			prisma.$queryRaw.mockResolvedValue([
				flat('root', null, 0, '2026-01-01T00:00:00Z'),
				flat('a', 'root', 1, '2026-01-02T00:00:00Z'),
				flat('b', 'root', 1, '2026-01-03T00:00:00Z'),
				flat('a1', 'a', 2, '2026-01-04T00:00:00Z'),
				flat('a1x', 'a1', 3, '2026-01-05T00:00:00Z'),
			]);

			const tree = await service.getCommentThread('root');

			expect(tree.replies.map(r => r.id)).toEqual(['b', 'a']); // LIFO
			expect(tree.repliesCount).toBe(2);
			const a = tree.replies[1];
			expect(a.replies.map(r => r.id)).toEqual(['a1']);
			expect(a.replies[0].replies.map(r => r.id)).toEqual(['a1x']);
			expect(a.replies[0].replies[0].replies).toEqual([]);
		});

		it('maps a joined attachment', async () => {
			prisma.$queryRaw.mockResolvedValue([
				flat('root', null, 0, '2026-01-01T00:00:00Z', {
					attachmentId: 'att-1',
					attachmentType: 'IMAGE',
					attachmentUrl: '/u/x.png',
					attachmentOriginalName: 'x.png',
					attachmentSize: 1234,
					attachmentProcessedAt: new Date('2026-01-01T01:00:00Z'),
				}),
			]);

			const tree = await service.getCommentThread('root');

			expect(tree.attachment).toMatchObject({
				id: 'att-1',
				type: 'IMAGE',
				url: '/u/x.png',
				size: 1234,
			});
		});

		it('404s when the CTE returns nothing (unknown id, or the id is a reply)', async () => {
			prisma.$queryRaw.mockResolvedValue([]);

			await expect(
				service.getCommentThread('nope'),
			).rejects.toBeInstanceOf(NotFoundException);
		});
	});
});
