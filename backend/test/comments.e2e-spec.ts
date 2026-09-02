import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import Redis from 'ioredis';
import { createTestApp } from './create-test-app';

interface GqlError {
	message: string;
	extensions?: { code?: string };
}
interface GqlBody<T> {
	data: T | null;
	errors?: GqlError[];
}

interface CreatedComment {
	createComment: {
		id: string;
		text: string;
		parentId: string | null;
		repliesCount: number;
		author: {
			id: string;
			username: string;
			email: string;
			homepage: string | null;
		};
	} | null;
}

const CREATE = `mutation ($input: CreateCommentInput!) {
  createComment(input: $input) {
    id
    text
    parentId
    repliesCount
    author { id username email homepage }
  }
}`;

describe('createComment (e2e)', () => {
	let app: INestApplication<App>;
	let redis: Redis;

	beforeAll(async () => {
		app = await createTestApp();
		redis = new Redis(process.env.REDIS_URL as string);
	});

	afterAll(async () => {
		await app?.close();
		await redis?.quit();
	});

	async function gql<T>(body: object): Promise<GqlBody<T>> {
		// No status assertion: a valid operation returns 200 (errors live in the
		// `errors` array); a malformed request — e.g. a missing non-null variable
		// — returns 400. Both carry an `errors` array.
		const res = await request(app.getHttpServer())
			.post('/graphql')
			.send(body);
		return res.body as GqlBody<T>;
	}

	/** Fetch a challenge and read its expected answer straight from Redis. */
	async function solvedCaptcha(): Promise<{ token: string; answer: string }> {
		const body = await gql<{ captchaChallenge: { token: string } }>({
			query: '{ captchaChallenge { token } }',
		});
		const token = body.data!.captchaChallenge.token;
		const answer = (await redis.get(`captcha:${token}`)) ?? '';
		return { token, answer };
	}

	async function createComment(
		fields: Record<string, unknown>,
		captcha?: { token: string; answer: string },
	): Promise<GqlBody<CreatedComment>> {
		const { token, answer } = captcha ?? (await solvedCaptcha());
		return gql<CreatedComment>({
			query: CREATE,
			variables: {
				input: {
					captchaToken: token,
					captchaAnswer: answer,
					...fields,
				},
			},
		});
	}

	let seq = 0;
	const validRoot = () => {
		seq += 1;
		return {
			username: `user${Date.now()}x${seq}`,
			email: `u${Date.now()}x${seq}@example.com`,
			text: 'Hello <strong>world</strong>',
		};
	};

	it('creates a root comment and its author', async () => {
		const input = validRoot();
		const body = await createComment(input);

		expect(body.errors).toBeUndefined();
		const c = body.data!.createComment!;
		expect(c.id).toEqual(expect.any(String));
		expect(c.text).toBe('Hello <strong>world</strong>');
		expect(c.parentId).toBeNull();
		expect(c.repliesCount).toBe(0);
		expect(c.author.username).toBe(input.username);
	});

	it('creates a reply to an existing comment', async () => {
		const parent = await createComment(validRoot());
		const parentId = parent.data!.createComment!.id;

		const body = await createComment({ ...validRoot(), parentId });

		expect(body.errors).toBeUndefined();
		expect(body.data!.createComment!.parentId).toBe(parentId);
	});

	it('rejects a missing required field (email)', async () => {
		const { username, text } = validRoot();
		const body = await createComment({ username, text });

		expect(body.data?.createComment).toBeFalsy();
		expect(body.errors?.[0].message).toMatch(/email/i);
	});

	it('rejects an invalid CAPTCHA answer', async () => {
		const body = await createComment(validRoot(), {
			token: 'definitely-not-a-real-token',
			answer: 'nope',
		});

		expect(body.data?.createComment ?? null).toBeNull();
		expect(body.errors?.[0].extensions?.code).toBe('BAD_REQUEST');
		expect(body.errors?.[0].message).toMatch(/CAPTCHA/i);
	});

	it('rejects an XSS attempt in the text', async () => {
		const body = await createComment({
			...validRoot(),
			text: '<script>alert(document.cookie)</script>',
		});

		expect(body.data?.createComment ?? null).toBeNull();
		expect(body.errors?.[0].extensions?.code).toBe('BAD_REQUEST');
		expect(body.errors?.[0].message).toMatch(/<script> tag is not allowed/);
	});

	it('rejects an invalid username format', async () => {
		const body = await createComment({
			...validRoot(),
			username: 'has spaces!',
		});

		expect(body.data?.createComment).toBeFalsy();
		expect(body.errors?.[0].message).toMatch(/Latin letters and digits/);
	});

	it('rejects a reply to a non-existent parent', async () => {
		const body = await createComment({
			...validRoot(),
			parentId: '00000000-0000-4000-8000-000000000000',
		});

		expect(body.data?.createComment ?? null).toBeNull();
		expect(body.errors?.[0].extensions?.code).toBe('NOT_FOUND');
	});

	it('consumes the CAPTCHA token (no replay)', async () => {
		const captcha = await solvedCaptcha();

		const first = await createComment(validRoot(), captcha);
		expect(first.errors).toBeUndefined();

		const second = await createComment(validRoot(), captcha);
		expect(second.data?.createComment ?? null).toBeNull();
		expect(second.errors?.[0].message).toMatch(/CAPTCHA/i);
	});
});
