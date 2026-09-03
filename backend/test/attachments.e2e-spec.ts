import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import Redis from 'ioredis';
import sharp from 'sharp';
import { createTestApp } from './create-test-app';
import { PrismaService } from '../src/core/prisma/prisma.service';

interface GqlError {
	message: string;
	extensions?: { code?: string };
}
interface GqlBody<T> {
	data: T | null;
	errors?: GqlError[];
}
interface Uploaded {
	uploadAttachment: {
		id: string;
		type: 'IMAGE' | 'TEXT';
		url: string;
		originalName: string;
		size: number;
		processedAt: string | null;
	} | null;
}

const UPLOAD = `mutation ($input: UploadAttachmentInput!) {
  uploadAttachment(input: $input) {
    id type url originalName size processedAt
  }
}`;

const solidPng = (w: number, h: number): Promise<Buffer> =>
	sharp({
		create: {
			width: w,
			height: h,
			channels: 3,
			background: { r: 200, g: 30, b: 90 },
		},
	})
		.png()
		.toBuffer();

describe('uploadAttachment + resize queue (e2e)', () => {
	let app: INestApplication<App>;
	let prisma: PrismaService;
	let redis: Redis;
	let uploadsDir: string;

	async function gql<T>(body: object): Promise<GqlBody<T>> {
		const res = await request(app.getHttpServer())
			.post('/graphql')
			.send(body);
		return res.body as GqlBody<T>;
	}

	function upload(
		filename: string,
		mimeType: string,
		bytes: Buffer,
	): Promise<GqlBody<Uploaded>> {
		return gql<Uploaded>({
			query: UPLOAD,
			variables: {
				input: { filename, mimeType, data: bytes.toString('base64') },
			},
		});
	}

	/** Poll the DB until the queue worker stamps processedAt (or time out). */
	async function waitProcessed(
		id: string,
		timeoutMs = 15_000,
	): Promise<Date> {
		const started = Date.now();
		for (;;) {
			const row = await prisma.attachment.findUnique({ where: { id } });
			if (row?.processedAt) {
				return row.processedAt;
			}
			if (Date.now() - started > timeoutMs) {
				throw new Error(
					`attachment ${id} not processed within ${timeoutMs}ms`,
				);
			}
			await new Promise(r => setTimeout(r, 150));
		}
	}

	async function diskDimensions(
		url: string,
	): Promise<{ width: number; height: number }> {
		const buf = await readFile(join(uploadsDir, basename(url)));
		const meta = await sharp(buf).metadata();
		return { width: meta.width ?? 0, height: meta.height ?? 0 };
	}

	async function solvedCaptcha(): Promise<{ token: string; answer: string }> {
		const body = await gql<{ captchaChallenge: { token: string } }>({
			query: '{ captchaChallenge { token } }',
		});
		const token = body.data!.captchaChallenge.token;
		return { token, answer: (await redis.get(`captcha:${token}`)) ?? '' };
	}

	beforeAll(async () => {
		app = await createTestApp();
		prisma = app.get(PrismaService);
		redis = new Redis(process.env.REDIS_URL as string);
		uploadsDir = join(process.cwd(), process.env.UPLOADS_DIR ?? 'uploads');
	});

	afterAll(async () => {
		await app?.close();
		await redis?.quit();
	});

	it('accepts a large image, queues it, and resizes it to fit 320×240', async () => {
		const original = await solidPng(1600, 1200);
		const res = await upload('big.png', 'image/png', original);

		const att = res.data!.uploadAttachment!;
		expect(att.type).toBe('IMAGE');
		expect(att.processedAt).toBeNull(); // not resized yet
		expect(att.size).toBe(original.length);

		await waitProcessed(att.id);

		const dims = await diskDimensions(att.url);
		expect(dims.width).toBe(320);
		expect(dims.height).toBe(240);

		const row = await prisma.attachment.findUnique({
			where: { id: att.id },
		});
		expect(row!.size).toBeLessThan(original.length); // row size updated
	});

	it('resizes proportionally, not by stretching (800×200 → 320×80)', async () => {
		const res = await upload(
			'wide.png',
			'image/png',
			await solidPng(800, 200),
		);
		const att = res.data!.uploadAttachment!;
		await waitProcessed(att.id);

		const dims = await diskDimensions(att.url);
		expect(dims).toEqual({ width: 320, height: 80 });
	});

	it('leaves an already-small image alone', async () => {
		const res = await upload(
			'tiny.png',
			'image/png',
			await solidPng(100, 60),
		);
		const att = res.data!.uploadAttachment!;
		await waitProcessed(att.id);

		expect(await diskDimensions(att.url)).toEqual({
			width: 100,
			height: 60,
		});
	});

	it('accepts a .txt under 100 KB (no queue, processed immediately)', async () => {
		const res = await upload(
			'note.txt',
			'text/plain',
			Buffer.from('a note with <chars> & "quotes"'),
		);
		const att = res.data!.uploadAttachment!;
		expect(att.type).toBe('TEXT');
		expect(att.processedAt).not.toBeNull();
	});

	it.each([
		[
			'oversized .txt',
			'big.txt',
			'text/plain',
			() => Buffer.alloc(120 * 1024, 0x41),
			/limit is 100 KB/,
		],
		[
			'disallowed MIME',
			'doc.pdf',
			'application/pdf',
			() => Buffer.from('%PDF-1.7'),
			/Unsupported file type/,
		],
		[
			'spoofed image MIME',
			'evil.png',
			'image/png',
			() => Buffer.from('definitely plain text, not an image'),
			/not a valid JPG, PNG or GIF/,
		],
		[
			'image with .exe extension',
			'payload.exe',
			'image/png',
			() => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]),
			/Image files must be/,
		],
	])('rejects %s', async (_label, filename, mime, make, message) => {
		const res = await upload(filename, mime, make());
		expect(res.data?.uploadAttachment ?? null).toBeNull();
		expect(res.errors?.[0].extensions?.code).toBe('BAD_REQUEST');
		expect(res.errors?.[0].message).toMatch(message);
	});

	it('links an uploaded+processed attachment to a comment via createComment', async () => {
		const up = await upload(
			'linked.png',
			'image/png',
			await solidPng(600, 400),
		);
		const attachmentId = up.data!.uploadAttachment!.id;
		await waitProcessed(attachmentId);

		const { token, answer } = await solvedCaptcha();
		const created = await gql<{ createComment: { id: string } | null }>({
			query: `mutation ($i: CreateCommentInput!) { createComment(input: $i) { id } }`,
			variables: {
				i: {
					username: `att${Date.now()}`,
					email: `att${Date.now()}@example.com`,
					text: 'with a picture',
					captchaToken: token,
					captchaAnswer: answer,
					attachmentId,
				},
			},
		});
		const commentId = created.data!.createComment!.id;

		const thread = await gql<{
			commentThread: { attachment: { id: string; type: string } | null };
		}>({
			query: `query ($id: ID!) { commentThread(rootId: $id) { attachment { id type } } }`,
			variables: { id: commentId },
		});
		expect(thread.data!.commentThread.attachment).toEqual({
			id: attachmentId,
			type: 'IMAGE',
		});

		// re-linking the same attachment is rejected (one-to-one)
		const c2 = await solvedCaptcha();
		const relink = await gql<{ createComment: unknown }>({
			query: `mutation ($i: CreateCommentInput!) { createComment(input: $i) { id } }`,
			variables: {
				i: {
					username: `att2${Date.now()}`,
					email: `att2${Date.now()}@example.com`,
					text: 'stealing the picture',
					captchaToken: c2.token,
					captchaAnswer: c2.answer,
					attachmentId,
				},
			},
		});
		expect(relink.errors?.[0].extensions?.code).toBe('BAD_REQUEST');
		expect(relink.errors?.[0].message).toMatch(/already linked/);
	});

	it('rejects createComment with an unknown attachmentId', async () => {
		const { token, answer } = await solvedCaptcha();
		const res = await gql<{ createComment: unknown }>({
			query: `mutation ($i: CreateCommentInput!) { createComment(input: $i) { id } }`,
			variables: {
				i: {
					username: `att3${Date.now()}`,
					email: `att3${Date.now()}@example.com`,
					text: 'ghost attachment',
					captchaToken: token,
					captchaAnswer: answer,
					attachmentId: '00000000-0000-4000-8000-000000000000',
				},
			},
		});
		expect(res.errors?.[0].extensions?.code).toBe('NOT_FOUND');
	});

	describe('attachment(id) query', () => {
		const ATTACHMENT = `query ($id: ID!) {
  attachment(id: $id) { id type url originalName size processedAt }
}`;

		/**
		 * Added so the frontend can poll `processedAt` on a just-uploaded image
		 * before it's linked to any comment (`commentThread` only reaches an
		 * attachment once it's linked — too late for that case).
		 */
		it('is reachable immediately after upload (processedAt still null), then reflects the resize once done', async () => {
			const res = await upload(
				'poll-me.png',
				'image/png',
				await solidPng(500, 500),
			);
			const id = res.data!.uploadAttachment!.id;

			const immediate = await gql<{
				attachment: { id: string; processedAt: string | null };
			}>({ query: ATTACHMENT, variables: { id } });
			expect(immediate.data!.attachment.id).toBe(id);
			expect(immediate.data!.attachment.processedAt).toBeNull();

			await waitProcessed(id);

			const after = await gql<{
				attachment: { processedAt: string | null; url: string };
			}>({ query: ATTACHMENT, variables: { id } });
			expect(after.data!.attachment.processedAt).not.toBeNull();
		});

		it('works for a linked attachment too (not just pre-submit ones)', async () => {
			const res = await upload(
				'note.txt',
				'text/plain',
				Buffer.from('hi'),
			);
			const id = res.data!.uploadAttachment!.id;

			const { token, answer } = await solvedCaptcha();
			await gql({
				query: `mutation ($i: CreateCommentInput!) { createComment(input: $i) { id } }`,
				variables: {
					i: {
						username: `attq${Date.now()}`,
						email: `attq${Date.now()}@example.com`,
						text: 'has an attachment',
						captchaToken: token,
						captchaAnswer: answer,
						attachmentId: id,
					},
				},
			});

			const linked = await gql<{ attachment: { id: string } }>({
				query: ATTACHMENT,
				variables: { id },
			});
			expect(linked.data!.attachment.id).toBe(id);
		});

		it('404s for an unknown id', async () => {
			const res = await gql<{ attachment: unknown }>({
				query: ATTACHMENT,
				variables: { id: '00000000-0000-4000-8000-000000000000' },
			});
			expect(res.errors?.[0].extensions?.code).toBe('NOT_FOUND');
		});
	});

	// Regression: `GqlThrottlerGuard` is registered globally (`APP_GUARD` in
	// CoreModule), so Nest runs it in front of the RabbitMQ consumer's
	// `@EventPattern` handler too, not just GraphQL resolvers. The global test
	// setup sets THROTTLE_DISABLED=true, which short-circuited the throttler
	// via `skipIf` *before* it ever touched the (GraphQL-only) request context —
	// masking a `TypeError: Cannot read properties of undefined (reading
	// 'req')` that only fired with throttling actually enabled. That crash left
	// every `attachment.resize` job un-ack'd and stuck in RabbitMQ forever, so
	// this block re-enables throttling the way `security.e2e-spec.ts` does and
	// drives a real upload through the real consumer to prove the guard no
	// longer touches non-GraphQL (RPC) contexts.
	describe('resize queue survives the global throttler guard (regression)', () => {
		beforeAll(() => {
			delete process.env.THROTTLE_DISABLED; // re-enable for this block
		});
		afterAll(() => {
			process.env.THROTTLE_DISABLED = 'true';
		});

		it('resizes an image even with the global rate limiter active', async () => {
			const res = await upload(
				'throttled.png',
				'image/png',
				await solidPng(640, 480),
			);
			const att = res.data!.uploadAttachment!;
			expect(att.processedAt).toBeNull();

			const processedAt = await waitProcessed(att.id);
			expect(processedAt).toBeInstanceOf(Date);

			const dims = await diskDimensions(att.url);
			expect(dims).toEqual({ width: 320, height: 240 });
		});
	});
});
