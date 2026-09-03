import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
	HTTP_BODY_LIMIT,
	ROOT_COMMENTS_CACHE_PREFIX,
} from '../src/shared/constants';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { CacheService } from '../src/modules/cache/cache.service';

/**
 * Boots the real AppModule with the same global pipe as `main.ts`, so e2e specs
 * exercise validation exactly as production does. Also starts the RabbitMQ
 * consumer so the attachment-resize queue is drained during tests.
 *
 * Every spec file calls this once, in its own `beforeAll` — see `resetTestState`
 * below for why that makes this THE place to guarantee a clean slate, rather
 * than relying on each spec to clean up after itself.
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

	await resetTestState(app);

	return app;
}

/**
 * Wipes every table an e2e spec can touch, plus the Redis `rootComments:*`
 * cache, before that spec's tests run.
 *
 * Each `.e2e-spec.ts` file calls `createTestApp()` exactly once in its own
 * `beforeAll`, so doing the reset in here — rather than per-spec — guarantees
 * every file starts from a pristine, deterministic DB regardless of what an
 * earlier spec file, a previous failed/interrupted run, or manual GraphQL
 * Sandbox testing left behind. (`jest-e2e.json` runs with `maxWorkers: 1`, so
 * spec files never race each other — this only has to protect against state
 * left over from *before* the current file started, not concurrent writers.)
 *
 * One `TRUNCATE` naming every table + `CASCADE`: `comments` self-references
 * (parent/replies) and FKs to `authors`/`attachments`, and `attachments` FKs
 * back to `comments` — ordering them correctly by hand is exactly the kind of
 * thing that's easy to get wrong, and unnecessary here. Truncating every FK
 * side in one statement (with `CASCADE` as a safety net for anything not
 * listed) sidesteps the dependency graph entirely. `moderators` is included
 * too: any spec that needs one (only `moderation.e2e-spec.ts` does) creates
 * its own right after calling `createTestApp()`, so this can't leave a spec
 * without the account it depends on — see that file's `beforeAll`.
 *
 * Redis is flushed too, not just Postgres: `rootComments` is cached under the
 * same key scheme (`rootComments:{page}:{sortBy}:{sortOrder}`) whether the hit
 * came from an e2e run or a manual Sandbox query, so a manually-populated
 * cache entry can otherwise leak stale data into a test that never touched it.
 */
async function resetTestState(app: INestApplication): Promise<void> {
	const prisma = app.get(PrismaService);
	await prisma.$executeRaw`TRUNCATE TABLE "comments", "authors", "attachments", "moderators" RESTART IDENTITY CASCADE`;

	const cache = app.get(CacheService);
	await cache.delByPattern(`${ROOT_COMMENTS_CACHE_PREFIX}*`);
}
