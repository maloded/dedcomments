import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import Redis from 'ioredis';
import { io, type Socket } from 'socket.io-client';
import { createTestApp } from './create-test-app';

describe('CommentsGateway — commentCreated (e2e)', () => {
	let app: INestApplication<App>;
	let redis: Redis;
	let socket: Socket;
	let baseUrl: string;

	beforeAll(async () => {
		app = await createTestApp();
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
	});

	afterAll(async () => {
		socket?.close();
		await app?.close();
		await redis?.quit();
	});

	it('pushes commentCreated to a connected client when a comment is posted', async () => {
		const received = new Promise<Record<string, unknown>>(resolve => {
			socket.once('commentCreated', resolve);
		});

		// post a comment over HTTP
		const chRes = await request(baseUrl)
			.post('/graphql')
			.send({ query: '{ captchaChallenge { token } }' });
		const token = (
			chRes.body as { data: { captchaChallenge: { token: string } } }
		).data.captchaChallenge.token;
		const answer = (await redis.get(`captcha:${token}`)) ?? '';

		const username = `wsuser${Date.now()}`;
		const createRes = await request(baseUrl)
			.post('/graphql')
			.send({
				query: `mutation ($i: CreateCommentInput!) {
					createComment(input: $i) { id }
				}`,
				variables: {
					i: {
						username,
						email: `${username}@example.com`,
						text: 'live <strong>update</strong>',
						captchaToken: token,
						captchaAnswer: answer,
					},
				},
			});
		const createdId = (
			createRes.body as { data: { createComment: { id: string } } }
		).data.createComment.id;

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
});
