import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('GraphQL API (e2e)', () => {
	let app: INestApplication<App>;

	beforeEach(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(new ValidationPipe({ transform: true }));
		await app.init();
	});

	afterEach(async () => {
		await app?.close();
	});

	it('answers the placeholder health query', () => {
		return request(app.getHttpServer())
			.post('/graphql')
			.send({ query: '{ health }' })
			.expect(200)
			.expect(res => {
				const body = res.body as { data?: { health?: string } };
				if (body.data?.health !== 'ok') {
					throw new Error(JSON.stringify(res.body));
				}
			});
	});
});
