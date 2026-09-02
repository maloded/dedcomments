import { plainToInstance, Type } from 'class-transformer';
import {
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	Min,
	validateSync,
} from 'class-validator';

export enum NodeEnv {
	Development = 'development',
	Production = 'production',
	Test = 'test',
}

/**
 * Whitelist + shape of every environment variable the app relies on. Anything
 * required that is missing or malformed fails the process at boot rather than
 * surfacing as a confusing runtime error later. DedStream leaned on
 * `configService.getOrThrow()` at call sites; we front-load the same guarantee.
 *
 * `@Type(() => Number)` converts the string env value to a number for validation
 * (we deliberately do NOT enable class-transformer's implicit conversion — it
 * turns missing values into `"undefined"` / `NaN` instead of leaving the
 * defaults below intact).
 */
export class EnvironmentVariables {
	@IsOptional()
	@IsEnum(NodeEnv)
	NODE_ENV: NodeEnv = NodeEnv.Development;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	APP_PORT = 4000;

	@IsOptional()
	@IsString()
	ALLOWED_ORIGIN?: string;

	@IsString()
	@IsNotEmpty()
	DATABASE_URL!: string;

	@IsString()
	@IsNotEmpty()
	REDIS_URL!: string;

	@IsString()
	@IsNotEmpty()
	RABBITMQ_URL!: string;

	@IsOptional()
	@IsString()
	RABBITMQ_ATTACHMENTS_QUEUE = 'attachment.resize';

	@IsOptional()
	@IsString()
	UPLOADS_DIR = 'uploads';

	@IsString()
	@IsNotEmpty()
	JWT_SECRET!: string;

	@IsOptional()
	@IsString()
	JWT_EXPIRES_IN = '1d';

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	CAPTCHA_TTL_SECONDS = 300;
}

export function validateEnv(
	config: Record<string, unknown>,
): EnvironmentVariables {
	const validated = plainToInstance(EnvironmentVariables, config);

	const errors = validateSync(validated, { skipMissingProperties: false });

	if (errors.length > 0) {
		const details = errors
			.map(
				error =>
					`  - ${error.property}: ${Object.values(
						error.constraints ?? {},
					).join(', ')}`,
			)
			.join('\n');
		throw new Error(`Invalid environment variables:\n${details}`);
	}

	return validated;
}
