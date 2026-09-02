import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MODERATOR_ROLE } from './auth.constants';

describe('AuthService', () => {
	let prisma: { moderator: { findUnique: jest.Mock } };
	let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
	let service: AuthService;

	const hash = bcrypt.hashSync('correct-horse', 10);
	const moderator = {
		id: 'mod-1',
		username: 'mod',
		passwordHash: hash,
		createdAt: new Date(),
	};

	beforeEach(() => {
		prisma = { moderator: { findUnique: jest.fn() } };
		jwt = {
			signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
			verifyAsync: jest.fn(),
		};
		service = new AuthService(
			prisma as unknown as PrismaService,
			jwt as unknown as JwtService,
		);
	});

	describe('moderatorLogin', () => {
		it('issues a JWT with the moderator claims on valid credentials', async () => {
			prisma.moderator.findUnique.mockResolvedValue(moderator);

			const result = await service.moderatorLogin({
				username: 'mod',
				password: 'correct-horse',
			});

			expect(jwt.signAsync).toHaveBeenCalledWith({
				sub: 'mod-1',
				username: 'mod',
				role: MODERATOR_ROLE,
			});
			expect(result.accessToken).toBe('signed.jwt.token');
			expect(result.moderator.id).toBe('mod-1');
		});

		it('rejects a wrong password with the same error as an unknown user', async () => {
			prisma.moderator.findUnique.mockResolvedValue(moderator);
			await expect(
				service.moderatorLogin({ username: 'mod', password: 'nope' }),
			).rejects.toBeInstanceOf(UnauthorizedException);

			prisma.moderator.findUnique.mockResolvedValue(null);
			await expect(
				service.moderatorLogin({ username: 'ghost', password: 'x' }),
			).rejects.toThrow('Invalid username or password.');
			expect(jwt.signAsync).not.toHaveBeenCalled();
		});
	});

	describe('verifyModerator', () => {
		it('returns the moderator for a valid token', async () => {
			jwt.verifyAsync.mockResolvedValue({
				sub: 'mod-1',
				username: 'mod',
				role: MODERATOR_ROLE,
			});
			prisma.moderator.findUnique.mockResolvedValue(moderator);

			await expect(service.verifyModerator('t')).resolves.toEqual(
				moderator,
			);
		});

		it('rejects a token that fails verification', async () => {
			jwt.verifyAsync.mockRejectedValue(new Error('bad signature'));
			await expect(service.verifyModerator('t')).rejects.toThrow(
				'Invalid or expired token.',
			);
		});

		it('rejects a token without the moderator role', async () => {
			jwt.verifyAsync.mockResolvedValue({ sub: 'x', role: 'USER' });
			await expect(service.verifyModerator('t')).rejects.toThrow(
				'Not a moderator token.',
			);
		});

		it('rejects when the account no longer exists', async () => {
			jwt.verifyAsync.mockResolvedValue({
				sub: 'gone',
				username: 'x',
				role: MODERATOR_ROLE,
			});
			prisma.moderator.findUnique.mockResolvedValue(null);
			await expect(service.verifyModerator('t')).rejects.toThrow(
				'Account no longer exists.',
			);
		});
	});
});
