import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuthorsService } from '../authors/authors.service';
import { CaptchaService } from '../captcha/captcha.service';
import { SanitizerService } from '../sanitizer/sanitizer.service';
import type { CreateCommentInput } from './inputs/create-comment.input';

const baseInput = (): CreateCommentInput => ({
	username: 'alice',
	email: 'alice@example.com',
	text: '<strong>hi</strong>',
	captchaToken: 'tok',
	captchaAnswer: 'answer',
});

describe('CommentsService.createComment', () => {
	let prisma: {
		comment: { findUnique: jest.Mock; create: jest.Mock };
		attachment: { findUnique: jest.Mock; update: jest.Mock };
		$transaction: jest.Mock;
	};
	type TxCallback = (tx: unknown) => unknown;
	let authors: { findOrCreate: jest.Mock };
	let captcha: { verify: jest.Mock };
	let sanitizer: { sanitize: jest.Mock };
	let service: CommentsService;

	beforeEach(() => {
		prisma = {
			comment: {
				findUnique: jest.fn(),
				create: jest.fn(),
			},
			attachment: { findUnique: jest.fn(), update: jest.fn() },
			$transaction: jest.fn((cb: TxCallback) => cb(prisma)),
		};
		authors = {
			findOrCreate: jest.fn().mockResolvedValue({
				id: 'author-1',
				username: 'alice',
				email: 'alice@example.com',
				homepage: null,
				createdAt: new Date(),
			}),
		};
		captcha = { verify: jest.fn().mockResolvedValue(true) };
		sanitizer = { sanitize: jest.fn((t: string) => t) };

		prisma.comment.create.mockResolvedValue({
			id: 'comment-1',
			text: '<strong>hi</strong>',
			parentId: null,
			authorId: 'author-1',
			createdAt: new Date(),
			author: {
				id: 'author-1',
				username: 'alice',
				email: 'alice@example.com',
				homepage: null,
				createdAt: new Date(),
			},
			_count: { replies: 0 },
		});

		service = new CommentsService(
			prisma as unknown as PrismaService,
			authors as unknown as AuthorsService,
			captcha as unknown as CaptchaService,
			sanitizer as unknown as SanitizerService,
		);
	});

	it('creates a comment on the happy path', async () => {
		const result = await service.createComment(baseInput());

		expect(captcha.verify).toHaveBeenCalledWith('tok', 'answer');
		expect(sanitizer.sanitize).toHaveBeenCalledWith('<strong>hi</strong>');
		expect(authors.findOrCreate).toHaveBeenCalledWith({
			username: 'alice',
			email: 'alice@example.com',
			homepage: undefined,
		});
		expect(prisma.comment.create).toHaveBeenCalled();
		expect(result.id).toBe('comment-1');
		expect(result.repliesCount).toBe(0);
	});

	it('fails fast on a bad CAPTCHA and never touches the DB', async () => {
		captcha.verify.mockResolvedValue(false);

		await expect(service.createComment(baseInput())).rejects.toBeInstanceOf(
			BadRequestException,
		);
		expect(sanitizer.sanitize).not.toHaveBeenCalled();
		expect(authors.findOrCreate).not.toHaveBeenCalled();
		expect(prisma.comment.create).not.toHaveBeenCalled();
	});

	it('rejects a reply to a non-existent parent', async () => {
		prisma.comment.findUnique.mockResolvedValue(null);

		await expect(
			service.createComment({ ...baseInput(), parentId: 'missing-id' }),
		).rejects.toBeInstanceOf(NotFoundException);
		expect(prisma.comment.create).not.toHaveBeenCalled();
	});

	it('accepts a reply when the parent exists', async () => {
		prisma.comment.findUnique.mockResolvedValue({ id: 'parent-1' });

		await service.createComment({ ...baseInput(), parentId: 'parent-1' });

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
