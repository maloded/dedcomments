import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

/**
 * Boots the real AppModule with the same global pipe as `main.ts`, so e2e specs
 * exercise validation exactly as production does. Requires Postgres + Redis to be
 * up (see docker-compose); env comes from backend/.env via setup-e2e.ts.
 */
export async function createTestApp(): Promise<INestApplication<App>> {
	const moduleFixture: TestingModule = await Test.createTestingModule({
		imports: [AppModule],
	}).compile();

	const app = moduleFixture.createNestApplication<INestApplication<App>>();
	app.useGlobalPipes(
		new ValidationPipe({
			transform: true,
			whitelist: true,
			forbidNonWhitelisted: true,
		}),
	);
	await app.init();
	return app;
}
