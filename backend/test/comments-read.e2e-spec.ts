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

interface RootCommentsData {
	rootComments: {
		totalCount: number;
		page: number;
		totalPages: number;
		items: {
			id: string;
			text: string;
			repliesCount: number;
			createdAt: string;
			author: { username: string; email: string };
		}[];
	};
}

interface ThreadNode {
	id: string;
	text: string;
	parentId: string | null;
	author: { username: string };
	attachment: { id: string } | null;
	repliesCount: number;
	replies: ThreadNode[];
}
interface ThreadData {
	commentThread: ThreadNode | null;
}

const ROOT_COMMENTS = `query ($page: Int, $sortBy: RootCommentSortField, $sortOrder: SortOrder) {
  rootComments(page: $page, sortBy: $sortBy, sortOrder: $sortOrder) {
    totalCount page totalPages
    items { id text repliesCount createdAt author { username email } }
  }
}`;

const THREAD = `query ($rootId: ID!) {
  commentThread(rootId: $rootId) {
    id text parentId author { username } attachment { id } repliesCount
    replies {
      id text author { username } repliesCount
      replies { id text repliesCount replies { id text } }
    }
  }
}`;

describe('rootComments + commentThread (e2e)', () => {
	let app: INestApplication<App>;
	let redis: Redis;

	// ids captured while seeding
	const roots: Record<string, string> = {};
	let alphaReplyOld = '';
	let alphaReplyNew = '';

	async function gql<T>(body: object): Promise<GqlBody<T>> {
		const res = await request(app.getHttpServer())
			.post('/graphql')
			.send(body);
		return res.body as GqlBody<T>;
	}

	async function seedComment(fields: {
		username: string;
		text: string;
		parentId?: string;
	}): Promise<string> {
		const challenge = await gql<{ captchaChallenge: { token: string } }>({
			query: '{ captchaChallenge { token } }',
		});
		const token = challenge.data!.captchaChallenge.token;
		const answer = (await redis.get(`captcha:${token}`)) ?? '';
		const res = await gql<{ createComment: { id: string } }>({
			query: `mutation ($i: CreateCommentInput!) { createComment(input: $i) { id } }`,
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
		if (res.errors) {
			throw new Error(`seed failed: ${JSON.stringify(res.errors)}`);
		}
		return res.data!.createComment.id;
	}

	const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

	async function flushRootCommentsCache(): Promise<void> {
		const keys = await redis.keys('rootComments:*');
		if (keys.length > 0) {
			await redis.del(...keys);
		}
	}

	beforeAll(async () => {
		// createTestApp() truncates every table + the rootComments Redis cache
		// before returning — see create-test-app.ts's resetTestState — so the
		// counts/ordering below are deterministic without this file also having
		// to clean up after whatever ran before it.
		app = await createTestApp();
		redis = new Redis(process.env.REDIS_URL as string);

		// 4 roots, created oldest→newest: zeta, alpha, mike, TestUser1. TestUser1
		// is mixed-case on purpose — it's the regression case for case-insensitive
		// USERNAME/EMAIL sorting (Postgres's default collation would otherwise put
		// every uppercase-leading name before every lowercase one).
		roots.zeta = await seedComment({
			username: 'zeta',
			text: 'root by zeta',
		});
		await wait(10);
		roots.alpha = await seedComment({
			username: 'alpha',
			text: '<strong>root</strong> by alpha',
		});
		await wait(10);
		roots.mike = await seedComment({
			username: 'mike',
			text: 'root by mike',
		});
		await wait(10);
		roots.testUser1 = await seedComment({
			username: 'TestUser1',
			text: 'root by TestUser1',
		});

		// alpha's thread: 2 direct replies + one nested 2 levels deeper (=> 4 levels total)
		await wait(10);
		alphaReplyOld = await seedComment({
			username: 'bob',
			text: 'older reply',
			parentId: roots.alpha,
		});
		await wait(10);
		alphaReplyNew = await seedComment({
			username: 'carol',
			text: 'newer reply',
			parentId: roots.alpha,
		});
		await wait(10);
		const deep1 = await seedComment({
			username: 'dave',
			text: 'level 3',
			parentId: alphaReplyOld,
		});
		await wait(10);
		await seedComment({
			username: 'erin',
			text: 'level 4',
			parentId: deep1,
		});
	});

	afterAll(async () => {
		await app?.close();
		await redis?.quit();
	});

	// ─── rootComments ───────────────────────────────────────────────────────

	it('default order is LIFO (newest root first) with correct repliesCount', async () => {
		const body = await gql<RootCommentsData>({ query: ROOT_COMMENTS });
		const page = body.data!.rootComments;

		expect(page.totalCount).toBe(4);
		expect(page.page).toBe(1);
		expect(page.totalPages).toBe(1);
		expect(page.items.map(i => i.author.username)).toEqual([
			'TestUser1',
			'mike',
			'alpha',
			'zeta',
		]);
		const alpha = page.items.find(i => i.author.username === 'alpha')!;
		expect(alpha.repliesCount).toBe(2); // direct replies only
	});

	it('sorts by USERNAME ascending and descending, case-insensitively', async () => {
		const asc = await gql<RootCommentsData>({
			query: ROOT_COMMENTS,
			variables: { sortBy: 'USERNAME', sortOrder: 'ASC' },
		});
		// Not ['TestUser1', 'alpha', 'mike', 'zeta'] — that would be Postgres's
		// default (case-sensitive) collation putting the capitalized name first.
		expect(
			asc.data!.rootComments.items.map(i => i.author.username),
		).toEqual(['alpha', 'mike', 'TestUser1', 'zeta']);

		const desc = await gql<RootCommentsData>({
			query: ROOT_COMMENTS,
			variables: { sortBy: 'USERNAME', sortOrder: 'DESC' },
		});
		expect(
			desc.data!.rootComments.items.map(i => i.author.username),
		).toEqual(['zeta', 'TestUser1', 'mike', 'alpha']);
	});

	it('sorts by EMAIL ascending, case-insensitively', async () => {
		const body = await gql<RootCommentsData>({
			query: ROOT_COMMENTS,
			variables: { sortBy: 'EMAIL', sortOrder: 'ASC' },
		});
		expect(body.data!.rootComments.items.map(i => i.author.email)).toEqual([
			'alpha@example.com',
			'mike@example.com',
			'TestUser1@example.com',
			'zeta@example.com',
		]);
	});

	it('returns an empty page past the end, with the real totalPages', async () => {
		const body = await gql<RootCommentsData>({
			query: ROOT_COMMENTS,
			variables: { page: 99 },
		});
		expect(body.data!.rootComments.items).toEqual([]);
		expect(body.data!.rootComments.page).toBe(99);
		expect(body.data!.rootComments.totalPages).toBe(1);
	});

	it('caches the result and busts it when a new root comment is posted', async () => {
		await flushRootCommentsCache();

		await gql<RootCommentsData>({ query: ROOT_COMMENTS }); // miss -> populate
		const key = 'rootComments:1:CREATED_AT:desc';
		expect(await redis.exists(key)).toBe(1);

		await gql<RootCommentsData>({ query: ROOT_COMMENTS }); // hit (still fine)

		await seedComment({ username: 'newbie', text: 'brand new root' });
		expect(await redis.exists(key)).toBe(0); // busted

		const after = await gql<RootCommentsData>({ query: ROOT_COMMENTS });
		expect(after.data!.rootComments.totalCount).toBe(5);
		expect(after.data!.rootComments.items[0].author.username).toBe(
			'newbie',
		);
	});

	// ─── commentThread ──────────────────────────────────────────────────────

	it('returns the whole tree, nested, LIFO within each level', async () => {
		const body = await gql<ThreadData>({
			query: THREAD,
			variables: { rootId: roots.alpha },
		});
		const tree = body.data!.commentThread!;

		expect(tree.id).toBe(roots.alpha);
		expect(tree.parentId).toBeNull();
		expect(tree.repliesCount).toBe(2);

		// LIFO: carol (newer) before bob (older)
		expect(tree.replies.map(r => r.author.username)).toEqual([
			'carol',
			'bob',
		]);

		const bob = tree.replies[1];
		expect(bob.id).toBe(alphaReplyOld);
		expect(bob.replies.map(r => r.text)).toEqual(['level 3']);
		expect(bob.replies[0].replies.map(r => r.text)).toEqual(['level 4']);
	});

	it('returns a lone root with an empty replies array', async () => {
		const body = await gql<ThreadData>({
			query: THREAD,
			variables: { rootId: roots.mike },
		});
		expect(body.data!.commentThread!.replies).toEqual([]);
		expect(body.data!.commentThread!.repliesCount).toBe(0);
	});

	it('404s for an unknown rootId', async () => {
		const body = await gql<ThreadData>({
			query: THREAD,
			variables: { rootId: '00000000-0000-4000-8000-000000000000' },
		});
		expect(body.data?.commentThread ?? null).toBeNull();
		expect(body.errors?.[0].extensions?.code).toBe('NOT_FOUND');
	});

	it('404s when asked for a thread by a reply id (not a root)', async () => {
		const body = await gql<ThreadData>({
			query: THREAD,
			variables: { rootId: alphaReplyNew },
		});
		expect(body.data?.commentThread ?? null).toBeNull();
		expect(body.errors?.[0].extensions?.code).toBe('NOT_FOUND');
	});

	it('is injection-safe: a rootId full of SQL metacharacters 404s cleanly and the table survives', async () => {
		const body = await gql<ThreadData>({
			query: THREAD,
			variables: {
				rootId: "'; DROP TABLE comments; DELETE FROM authors; --",
			},
		});
		expect(body.data?.commentThread ?? null).toBeNull();
		expect(body.errors?.[0].extensions?.code).toBe('NOT_FOUND');

		// the comments table is still there and queryable
		const check = await gql<RootCommentsData>({ query: ROOT_COMMENTS });
		expect(check.errors).toBeUndefined();
		expect(check.data!.rootComments.totalCount).toBeGreaterThan(0);
	});
});
