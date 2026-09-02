import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './create-test-app';

interface CaptchaBody {
	data: {
		captchaChallenge: { token: string; image: string; expiresAt: string };
	} | null;
	errors?: unknown;
}

describe('GraphQL API (e2e) — schema smoke test', () => {
	let app: INestApplication<App>;

	beforeAll(async () => {
		app = await createTestApp();
	});

	afterAll(async () => {
		await app?.close();
	});

	it('serves captchaChallenge', async () => {
		const res = await request(app.getHttpServer())
			.post('/graphql')
			.send({ query: '{ captchaChallenge { token image expiresAt } }' })
			.expect(200);

		const body = res.body as CaptchaBody;
		const challenge = body.data?.captchaChallenge;
		expect(challenge?.token).toEqual(expect.any(String));
		expect(challenge?.image).toMatch(/^data:image\/svg\+xml;base64,/);
	});
});
