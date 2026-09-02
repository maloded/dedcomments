import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import Redis from 'ioredis';
import { createTestApp } from './create-test-app';
import { COMMENT_TEXT_MAX_LENGTH } from '../src/shared/constants';

interface GqlError {
	message: string;
	extensions?: { code?: string };
}
interface GqlBody<T> {
	data: T | null;
	errors?: GqlError[];
}

describe('security pass (e2e)', () => {
	let app: INestApplication<App>;
	let redis: Redis;

	async function gql<T>(body: object): Promise<GqlBody<T>> {
		const res = await request(app.getHttpServer())
			.post('/graphql')
			.send(body);
		return res.body as GqlBody<T>;
	}

	async function createComment(
		text: string,
		username = `sec${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
	): Promise<GqlBody<{ createComment: { id: string } | null }>> {
		const ch = await gql<{ captchaChallenge: { token: string } }>({
			query: '{ captchaChallenge { token } }',
		});
		const token = ch.data!.captchaChallenge.token;
		const answer = (await redis.get(`captcha:${token}`)) ?? '';
		return gql({
			query: `mutation ($i: CreateCommentInput!) { createComment(input: $i) { id } }`,
			variables: {
				i: {
					username,
					email: `${username}@example.com`,
					text,
					captchaToken: token,
					captchaAnswer: answer,
				},
			},
		});
	}

	beforeAll(async () => {
		app = await createTestApp();
		redis = new Redis(process.env.REDIS_URL as string);
	});

	afterAll(async () => {
		await app?.close();
		await redis?.quit();
	});

	describe('sanitizer / XSS', () => {
		it.each([
			[
				'mixed-case script tag',
				'<ScRiPt>alert(1)</ScRiPt>',
				/not allowed/i,
			],
			[
				'data: URI in href',
				'<a href="data:text/html,<script>alert(1)</script>">x</a>',
				/Unsafe or unsupported link URL/,
			],
			[
				'javascript: URI in href',
				'<a href="JavaScript:alert(1)">x</a>',
				/Unsafe or unsupported link URL/,
			],
			[
				'event handler attribute',
				'<a href="https://x.com" onmouseover="steal()">x</a>',
				/Attribute "onmouseover" is not allowed/,
			],
		])('rejects %s', async (_label, text, message) => {
			const res = await createComment(text);
			expect(res.data?.createComment ?? null).toBeNull();
			expect(res.errors?.[0].extensions?.code).toBe('BAD_REQUEST');
			expect(res.errors?.[0].message).toMatch(message);
		});

		it('stores an entity-encoded attack string as inert text', async () => {
			const res = await createComment(
				'&lt;script&gt;alert(1)&lt;/script&gt;',
			);
			expect(res.errors).toBeUndefined();
			expect(res.data!.createComment).not.toBeNull();
		});

		it(`rejects a comment body over ${COMMENT_TEXT_MAX_LENGTH} chars`, async () => {
			const res = await createComment(
				'a'.repeat(COMMENT_TEXT_MAX_LENGTH + 1),
			);
			expect(res.data?.createComment ?? null).toBeNull();
			expect(res.errors?.[0].extensions?.code).toBe('BAD_REQUEST');
		});
	});

	describe('SQL injection — commentThread rootId is parameterised', () => {
		it.each([
			"1' OR '1'='1",
			"'; DROP TABLE comments; --",
			"' UNION SELECT * FROM moderators --",
			') OR pg_sleep(5) --',
		])('%s → clean NOT_FOUND', async payload => {
			const res = await gql<{ commentThread: unknown }>({
				query: `query ($id: ID!) { commentThread(rootId: $id) { id } }`,
				variables: { id: payload },
			});
			expect(res.data?.commentThread ?? null).toBeNull();
			expect(res.errors?.[0].extensions?.code).toBe('NOT_FOUND');
		});

		it('the tables are intact afterwards', async () => {
			const res = await gql<{ rootComments: { totalCount: number } }>({
				query: `{ rootComments { totalCount } }`,
			});
			expect(res.errors).toBeUndefined();
			expect(res.data!.rootComments.totalCount).toBeGreaterThanOrEqual(0);
		});
	});

	describe('rate limiting', () => {
		beforeAll(() => {
			delete process.env.THROTTLE_DISABLED; // re-enable for this block
		});
		afterAll(() => {
			process.env.THROTTLE_DISABLED = 'true';
		});

		it('throttles createComment after its per-minute limit', async () => {
			const codes: (string | undefined)[] = [];
			for (let i = 0; i < 16; i += 1) {
				const res = await createComment('flood', 'flooduser');
				codes.push(
					res.errors?.[0]?.extensions?.code ??
						(res.data?.createComment ? 'OK' : 'ERR'),
				);
			}
			expect(codes.filter(c => c === 'OK').length).toBeLessThanOrEqual(
				10,
			);
			expect(codes).toContain('THROTTLER');
		});

		it('throttles moderatorLogin after its per-minute limit', async () => {
			const codes: (string | undefined)[] = [];
			for (let i = 0; i < 8; i += 1) {
				const res = await gql<{ moderatorLogin: unknown }>({
					query: `mutation ($i: ModeratorLoginInput!) {
						moderatorLogin(input: $i) { accessToken }
					}`,
					variables: {
						i: { username: 'nobody', password: 'nope' },
					},
				});
				codes.push(res.errors?.[0]?.extensions?.code);
			}
			expect(codes).toContain('THROTTLER');
			expect(
				codes.filter(c => c === 'UNAUTHORIZED').length,
			).toBeLessThanOrEqual(5);
		});
	});
});
