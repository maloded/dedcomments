import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import type { Author, Comment } from '@prisma/client';

import { PrismaService } from '../../core/prisma/prisma.service';
import { AuthorsService } from '../authors/authors.service';
import { CaptchaService } from '../captcha/captcha.service';
import { SanitizerService } from '../sanitizer/sanitizer.service';
import type { CreateCommentInput } from './inputs/create-comment.input';
import type { CommentModel } from './models/comment.model';

type CommentWithRelations = Comment & {
	author: Author;
	_count: { replies: number };
};

@Injectable()
export class CommentsService {
	public constructor(
		private readonly prismaService: PrismaService,
		private readonly authorsService: AuthorsService,
		private readonly captchaService: CaptchaService,
		private readonly sanitizerService: SanitizerService,
	) {}

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

		return CommentsService.toModel(comment);
	}

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
}
