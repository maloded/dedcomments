import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';

/**
 * Thin wrapper around `@nestjs/config` so the rest of the app imports one module
 * and gets a validated, global `ConfigService`. `.env` is loaded by Nest in dev;
 * in production the platform injects real env vars (Docker Compose `env_file` +
 * `environment`).
 */
@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			cache: true,
			validate: validateEnv,
		}),
	],
})
export class AppConfigModule {}
