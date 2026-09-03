import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import Redis from 'ioredis';
import * as bcrypt from 'bcryptjs';
import { io, type Socket } from 'socket.io-client';
import { createTestApp } from './create-test-app';
import { PrismaService } from '../src/core/prisma/prisma.service';

const MOD_USER = `ws_mod_${Date.now()}`;
const MOD_PASS = 'super-secret-e2e';

describe('CommentsGateway — live broadcasts (e2e)', () => {
	let app: INestApplication<App>;
	let prisma: PrismaService;
	let redis: Redis;
	let socket: Socket;
	let baseUrl: string;
	let moderatorToken: string;

	async function createComment(fields: {
		username: string;
		text: string;
		parentId?: string;
	}): Promise<{ id: string; authorId: string }> {
		const chRes = await request(baseUrl)
			.post('/graphql')
			.send({ query: '{ captchaChallenge { token } }' });
		const token = (
			chRes.body as { data: { captchaChallenge: { token: string } } }
		).data.captchaChallenge.token;
		const answer = (await redis.get(`captcha:${token}`)) ?? '';

		const res = await request(baseUrl)
			.post('/graphql')
			.send({
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
		const body = res.body as {
			data: { createComment: { id: string; author: { id: string } } };
		};
		return {
			id: body.data.createComment.id,
			authorId: body.data.createComment.author.id,
		};
	}

	beforeAll(async () => {
		app = await createTestApp();
		prisma = app.get(PrismaService);
		redis = new Redis(process.env.REDIS_URL as string);

		// a real listening port is needed for the socket.io client
		await app.listen(0);
		baseUrl = (await app.getUrl())
			.replace('[::1]', '127.0.0.1')
			.replace('0.0.0.0', '127.0.0.1');

		socket = io(baseUrl, { transports: ['websocket'], forceNew: true });
		await new Promise<void>((resolve, reject) => {
			socket.on('connect', () => resolve());
			socket.on('connect_error', reject);
		});

		await prisma.moderator.upsert({
			where: { username: MOD_USER },
			create: {
				username: MOD_USER,
				passwordHash: await bcrypt.hash(MOD_PASS, 10),
			},
			update: {},
		});
		const loginRes = await request(baseUrl)
			.post('/graphql')
			.send({
				query: `mutation ($i: ModeratorLoginInput!) {
					moderatorLogin(input: $i) { accessToken }
				}`,
				variables: { i: { username: MOD_USER, password: MOD_PASS } },
			});
		moderatorToken = (
			loginRes.body as {
				data: { moderatorLogin: { accessToken: string } };
			}
		).data.moderatorLogin.accessToken;
	});

	afterAll(async () => {
		socket?.close();
		await prisma.moderator.deleteMany({ where: { username: MOD_USER } });
		await app?.close();
		await redis?.quit();
	});

	it('pushes commentCreated to a connected client when a comment is posted', async () => {
		const received = new Promise<Record<string, unknown>>(resolve => {
			socket.once('commentCreated', resolve);
		});

		const username = `wsuser${Date.now()}`;
		const { id: createdId } = await createComment({
			username,
			text: 'live <strong>update</strong>',
		});

		const payload = (await Promise.race([
			received,
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error('no commentCreated event')),
					5000,
				),
			),
		])) as {
			id: string;
			text: string;
			parentId: string | null;
			createdAt: string;
			author: { username: string; email: string };
		};

		expect(payload.id).toBe(createdId);
		expect(payload.text).toBe('live <strong>update</strong>');
		expect(payload.parentId).toBeNull();
		expect(payload.author.username).toBe(username);
		expect(typeof payload.createdAt).toBe('string');
	});

	it('pushes commentHidden to a connected client when a moderator hides a comment', async () => {
		const { id: commentId } = await createComment({
			username: `wshide${Date.now()}`,
			text: 'about to be hidden',
		});

		const received = new Promise<Record<string, unknown>>(resolve => {
			socket.once('commentHidden', resolve);
		});

		const hideRes = await request(baseUrl)
			.post('/graphql')
			.set('authorization', `Bearer ${moderatorToken}`)
			.send({
				query: `mutation ($id: ID!) { hideComment(commentId: $id) { id } }`,
				variables: { id: commentId },
			});
		expect((hideRes.body as { errors?: unknown[] }).errors).toBeUndefined();

		const payload = (await Promise.race([
			received,
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error('no commentHidden event')),
					5000,
				),
			),
		])) as { id: string; parentId: string | null };

		expect(payload.id).toBe(commentId);
		expect(payload.parentId).toBeNull();
	});

	it('pushes authorBanned to a connected client when a moderator bans an author', async () => {
		const username = `wsban${Date.now()}`;
		const { authorId } = await createComment({
			username,
			text: 'author about to be banned',
		});

		const received = new Promise<Record<string, unknown>>(resolve => {
			socket.once('authorBanned', resolve);
		});

		const banRes = await request(baseUrl)
			.post('/graphql')
			.set('authorization', `Bearer ${moderatorToken}`)
			.send({
				query: `mutation ($id: ID!) { banAuthor(authorId: $id) { id } }`,
				variables: { id: authorId },
			});
		expect((banRes.body as { errors?: unknown[] }).errors).toBeUndefined();

		const payload = (await Promise.race([
			received,
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error('no authorBanned event')),
					5000,
				),
			),
		])) as { id: string; username: string };

		expect(payload.id).toBe(authorId);
		expect(payload.username).toBe(username);
	});
});
