import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import Redis from 'ioredis';
import * as bcrypt from 'bcryptjs';
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

const MOD_USER = `mod_${Date.now()}`;
const MOD_PASS = 'super-secret-e2e';

describe('moderation: JWT auth + hideComment + banAuthor (e2e)', () => {
	let app: INestApplication<App>;
	let prisma: PrismaService;
	let redis: Redis;

	async function gql<T>(body: object, token?: string): Promise<GqlBody<T>> {
		const req = request(app.getHttpServer()).post('/graphql').send(body);
		if (token) {
			req.set('authorization', `Bearer ${token}`);
		}
		return (await req).body as GqlBody<T>;
	}

	async function createComment(fields: {
		username: string;
		text: string;
		parentId?: string;
	}): Promise<
		GqlBody<{ createComment: { id: string; author: { id: string } } }>
	> {
		const ch = await gql<{ captchaChallenge: { token: string } }>({
			query: '{ captchaChallenge { token } }',
		});
		const token = ch.data!.captchaChallenge.token;
		const answer = (await redis.get(`captcha:${token}`)) ?? '';
		return gql({
			query: `mutation ($i: CreateCommentInput!) {
				createComment(input: $i) { id author { id } }
			}`,
			variables: {
				i: {
					username: fields.username,
					email: `${fields.username}@example.com`,
					text: fields.text,
					parentId: fields.parentId,
					captchaToken: token,
					captchaAnswer: answer,
				},
			},
		});
	}

	function login(
		username: string,
		password: string,
	): Promise<GqlBody<{ moderatorLogin: { accessToken: string } }>> {
		return gql({
			query: `mutation ($i: ModeratorLoginInput!) {
				moderatorLogin(input: $i) { accessToken moderator { username } }
			}`,
			variables: { i: { username, password } },
		});
	}

	let jwt: string;

	beforeAll(async () => {
		app = await createTestApp();
		prisma = app.get(PrismaService);
		redis = new Redis(process.env.REDIS_URL as string);

		await prisma.moderator.upsert({
			where: { username: MOD_USER },
			create: {
				username: MOD_USER,
				passwordHash: await bcrypt.hash(MOD_PASS, 10),
			},
			update: {},
		});
	});

	afterAll(async () => {
		await prisma.moderator.deleteMany({ where: { username: MOD_USER } });
		await app?.close();
		await redis?.quit();
	});

	it('moderatorLogin succeeds with valid credentials', async () => {
		const res = await login(MOD_USER, MOD_PASS);
		expect(res.errors).toBeUndefined();
		jwt = res.data!.moderatorLogin.accessToken;
		expect(jwt.split('.')).toHaveLength(3); // header.payload.signature
	});

	it('moderatorLogin fails with a wrong password', async () => {
		const res = await login(MOD_USER, 'wrong');
		expect(res.data?.moderatorLogin ?? null).toBeNull();
		expect(res.errors?.[0].extensions?.code).toBe('UNAUTHORIZED');
	});

	it('hideComment requires a valid bearer token', async () => {
		const c = await createComment({ username: 'target1', text: 'hide me' });
		const commentId = c.data!.createComment.id;

		const noToken = await gql<{ hideComment: unknown }>({
			query: `mutation ($id: ID!) { hideComment(commentId: $id) { id } }`,
			variables: { id: commentId },
		});
		expect(noToken.errors?.[0].extensions?.code).toBe('UNAUTHORIZED');

		const badToken = await gql<{ hideComment: unknown }>(
			{
				query: `mutation ($id: ID!) { hideComment(commentId: $id) { id } }`,
				variables: { id: commentId },
			},
			'not.a.jwt',
		);
		expect(badToken.errors?.[0].extensions?.code).toBe('UNAUTHORIZED');
	});

	it('a hidden comment disappears from rootComments and commentThread', async () => {
		const c = await createComment({ username: 'target2', text: 'bye' });
		const commentId = c.data!.createComment.id;

		const hidden = await gql<{ hideComment: { id: string } }>(
			{
				query: `mutation ($id: ID!) { hideComment(commentId: $id) { id } }`,
				variables: { id: commentId },
			},
			jwt,
		);
		expect(hidden.errors).toBeUndefined();

		const list = await gql<{
			rootComments: { items: { id: string }[] };
		}>({ query: `{ rootComments(page: 1) { items { id } } }` });
		expect(
			list.data!.rootComments.items.some(i => i.id === commentId),
		).toBe(false);

		const thread = await gql<{ commentThread: unknown }>({
			query: `query ($id: ID!) { commentThread(rootId: $id) { id } }`,
			variables: { id: commentId },
		});
		expect(thread.errors?.[0].extensions?.code).toBe('NOT_FOUND');
	});

	it('hideComment 404s for an unknown comment id', async () => {
		const res = await gql<{ hideComment: unknown }>(
			{
				query: `mutation ($id: ID!) { hideComment(commentId: $id) { id } }`,
				variables: { id: '00000000-0000-4000-8000-000000000000' },
			},
			jwt,
		);
		expect(res.errors?.[0].extensions?.code).toBe('NOT_FOUND');
	});

	it('banAuthor blocks that identity from posting further comments', async () => {
		const first = await createComment({
			username: 'spammer',
			text: 'first post',
		});
		const authorId = first.data!.createComment.author.id;

		const ban = await gql<{ banAuthor: { isBanned: boolean } }>(
			{
				query: `mutation ($id: ID!) { banAuthor(authorId: $id) { id isBanned } }`,
				variables: { id: authorId },
			},
			jwt,
		);
		expect(ban.data!.banAuthor.isBanned).toBe(true);

		const blocked = await createComment({
			username: 'spammer',
			text: 'trying again',
		});
		expect(blocked.data?.createComment ?? null).toBeNull();
		expect(blocked.errors?.[0].extensions?.code).toBe('FORBIDDEN');

		// a different identity is unaffected
		const other = await createComment({
			username: 'innocent',
			text: 'hello',
		});
		expect(other.errors).toBeUndefined();
	});

	it('banAuthor requires a token and 404s for an unknown id', async () => {
		const noToken = await gql<{ banAuthor: unknown }>({
			query: `mutation ($id: ID!) { banAuthor(authorId: $id) { id } }`,
			variables: { id: '00000000-0000-4000-8000-000000000000' },
		});
		expect(noToken.errors?.[0].extensions?.code).toBe('UNAUTHORIZED');

		const unknown = await gql<{ banAuthor: unknown }>(
			{
				query: `mutation ($id: ID!) { banAuthor(authorId: $id) { id } }`,
				variables: { id: '00000000-0000-4000-8000-000000000000' },
			},
			jwt,
		);
		expect(unknown.errors?.[0].extensions?.code).toBe('NOT_FOUND');
	});
});
