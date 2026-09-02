import {
	Injectable,
	Logger,
	type OnModuleDestroy,
	type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Thin wrapper over a single ioredis connection. Used for:
 *   - one-time CAPTCHA answers (short TTL, see CaptchaService)
 *   - the top-level comments list cache (added in a later step)
 *
 * Kept deliberately small — `get` / `set` (+ optional TTL) / `del` plus JSON
 * helpers. ioredis handles reconnection on its own.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(CacheService.name);
	private readonly client: Redis;

	public constructor(configService: ConfigService) {
		this.client = new Redis(configService.getOrThrow<string>('REDIS_URL'), {
			maxRetriesPerRequest: 2,
			lazyConnect: true,
		});
		this.client.on('error', (error: Error) =>
			this.logger.error(`Redis error: ${error.message}`),
		);
	}

	public async onModuleInit(): Promise<void> {
		await this.client.connect();
		this.logger.log('Redis connected');
	}

	public async onModuleDestroy(): Promise<void> {
		await this.client.quit();
	}

	public async get(key: string): Promise<string | null> {
		return this.client.get(key);
	}

	public async set(
		key: string,
		value: string,
		ttlSeconds?: number,
	): Promise<void> {
		if (ttlSeconds && ttlSeconds > 0) {
			await this.client.set(key, value, 'EX', ttlSeconds);
		} else {
			await this.client.set(key, value);
		}
	}

	public async del(key: string): Promise<void> {
		await this.client.del(key);
	}

	public async getJson<T>(key: string): Promise<T | null> {
		const raw = await this.get(key);
		return raw === null ? null : (JSON.parse(raw) as T);
	}

	public async setJson(
		key: string,
		value: unknown,
		ttlSeconds?: number,
	): Promise<void> {
		await this.set(key, JSON.stringify(value), ttlSeconds);
	}
}
