import { ConfigService } from '@nestjs/config';
import { CaptchaService } from './captcha.service';
import { CacheService } from '../cache/cache.service';
import { CAPTCHA_KEY_PREFIX } from '../../shared/constants';

describe('CaptchaService', () => {
	let store: Map<string, string>;
	let cache: jest.Mocked<Pick<CacheService, 'get' | 'set' | 'del'>>;
	let service: CaptchaService;

	beforeEach(() => {
		store = new Map();
		cache = {
			get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
			set: jest.fn((k: string, v: string) => {
				store.set(k, v);
				return Promise.resolve();
			}),
			del: jest.fn((k: string) => {
				store.delete(k);
				return Promise.resolve();
			}),
		};
		const config = {
			get: jest.fn().mockReturnValue(120),
		} as unknown as ConfigService;
		service = new CaptchaService(cache as unknown as CacheService, config);
	});

	it('generates a token, an SVG data URL and a future expiry, and stores the answer', async () => {
		const challenge = await service.generateChallenge();

		expect(challenge.token).toMatch(/^[0-9a-f-]{36}$/);
		expect(challenge.image).toMatch(/^data:image\/svg\+xml;base64,/);
		expect(challenge.expiresAt.getTime()).toBeGreaterThan(Date.now());

		expect(cache.set).toHaveBeenCalledWith(
			CAPTCHA_KEY_PREFIX + challenge.token,
			expect.any(String),
			120,
		);
		// stored lower-cased
		expect(store.get(CAPTCHA_KEY_PREFIX + challenge.token)).toMatch(
			/^[a-z0-9]+$/,
		);
	});

	it('verifies the correct answer case-insensitively and consumes the token', async () => {
		const token = 'tok-1';
		store.set(CAPTCHA_KEY_PREFIX + token, 'ab3d');

		await expect(service.verify(token, 'AB3D')).resolves.toBe(true);
		expect(cache.del).toHaveBeenCalledWith(CAPTCHA_KEY_PREFIX + token);
		expect(store.has(CAPTCHA_KEY_PREFIX + token)).toBe(false);
	});

	it('rejects a wrong answer and still consumes the token (one-time use)', async () => {
		const token = 'tok-2';
		store.set(CAPTCHA_KEY_PREFIX + token, 'ab3d');

		await expect(service.verify(token, 'nope')).resolves.toBe(false);
		expect(store.has(CAPTCHA_KEY_PREFIX + token)).toBe(false);

		// second attempt with the right answer now fails — token is gone
		await expect(service.verify(token, 'ab3d')).resolves.toBe(false);
	});

	it('rejects an unknown / expired token', async () => {
		await expect(service.verify('missing', 'whatever')).resolves.toBe(
			false,
		);
	});

	it('rejects empty token or answer without hitting the cache', async () => {
		await expect(service.verify('', 'x')).resolves.toBe(false);
		await expect(service.verify('x', '')).resolves.toBe(false);
		expect(cache.get).not.toHaveBeenCalled();
	});
});
