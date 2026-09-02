import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { create as createSvgCaptcha } from 'svg-captcha';

import { CacheService } from '../cache/cache.service';
import {
	CAPTCHA_IGNORE_CHARS,
	CAPTCHA_KEY_PREFIX,
	CAPTCHA_LENGTH,
} from '../../shared/constants';
import type { CaptchaChallengeModel } from './models/captcha-challenge.model';

@Injectable()
export class CaptchaService {
	private readonly ttlSeconds: number;

	public constructor(
		private readonly cacheService: CacheService,
		configService: ConfigService,
	) {
		this.ttlSeconds =
			configService.get<number>('CAPTCHA_TTL_SECONDS') ?? 300;
	}

	/**
	 * Generate a challenge: a random token + an SVG image. The expected answer is
	 * stored in Redis (lower-cased) under the token, with a TTL, and returned to
	 * the client only as a picture.
	 */
	public async generateChallenge(): Promise<CaptchaChallengeModel> {
		const { data: svg, text } = createSvgCaptcha({
			size: CAPTCHA_LENGTH,
			ignoreChars: CAPTCHA_IGNORE_CHARS,
			noise: 3,
			color: true,
			background: '#f4f4f5',
		});

		const token = randomUUID();
		await this.cacheService.set(
			CAPTCHA_KEY_PREFIX + token,
			text.toLowerCase(),
			this.ttlSeconds,
		);

		return {
			token,
			image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
			expiresAt: new Date(Date.now() + this.ttlSeconds * 1000),
		};
	}

	/**
	 * One-time verification used internally by `createComment`. The stored answer
	 * is deleted whether or not it matched, so a token can never be replayed and
	 * wrong guesses cost a fresh challenge.
	 *
	 * Comparison is case-insensitive (typical CAPTCHA UX).
	 */
	public async verify(token: string, answer: string): Promise<boolean> {
		if (!token || !answer) {
			return false;
		}

		const key = CAPTCHA_KEY_PREFIX + token;
		const expected = await this.cacheService.get(key);
		await this.cacheService.del(key);

		if (expected === null) {
			return false;
		}

		return expected === answer.trim().toLowerCase();
	}
}
