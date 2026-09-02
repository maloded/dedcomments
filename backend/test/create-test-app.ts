import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HTTP_BODY_LIMIT } from '../src/shared/constants';

/**
 * Boots the real AppModule with the same global pipe as `main.ts`, so e2e specs
 * exercise validation exactly as production does. Also starts the RabbitMQ
 * consumer so the attachment-resize queue is drained during tests.
 *
 * Requires Postgres + Redis + RabbitMQ to be up (see docker-compose); env comes
 * from backend/.env via setup-e2e.ts. Run e2e with the dev server stopped so the
 * two processes don't both pull from the shared queue.
 */
export async function createTestApp(): Promise<INestApplication<App>> {
	const moduleFixture: TestingModule = await Test.createTestingModule({
		imports: [AppModule],
	}).compile();

	const app = moduleFixture.createNestApplication<
		INestApplication<App> & NestExpressApplication
	>();
	app.useGlobalPipes(
		new ValidationPipe({
			transform: true,
			whitelist: true,
			forbidNonWhitelisted: true,
		}),
	);
	app.useBodyParser('json', { limit: HTTP_BODY_LIMIT });

	const config = app.get(ConfigService);
	app.connectMicroservice<MicroserviceOptions>({
		transport: Transport.RMQ,
		options: {
			urls: [config.getOrThrow<string>('RABBITMQ_URL')],
			queue: config.getOrThrow<string>('RABBITMQ_ATTACHMENTS_QUEUE'),
			queueOptions: { durable: true },
			noAck: false,
		},
	});
	await app.startAllMicroservices();
	await app.init();
	return app;
}
