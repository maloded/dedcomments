import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthorsService } from './authors.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('AuthorsService', () => {
	let prisma: {
		author: {
			findUnique: jest.Mock;
			upsert: jest.Mock;
			update: jest.Mock;
		};
	};
	let service: AuthorsService;

	beforeEach(() => {
		prisma = {
			author: {
				findUnique: jest.fn(),
				upsert: jest
					.fn()
					.mockResolvedValue({ id: 'a1', isBanned: false }),
				update: jest
					.fn()
					.mockResolvedValue({ id: 'a1', isBanned: true }),
			},
		};
		service = new AuthorsService(prisma as unknown as PrismaService);
	});

	describe('findOrCreate', () => {
		it('upserts by the (username, email) identity', async () => {
			prisma.author.findUnique.mockResolvedValue(null);

			await service.findOrCreate({
				username: 'bob',
				email: 'bob@e.com',
				homepage: '  https://bob.dev  ',
			});

			const [arg] = prisma.author.upsert.mock.calls.at(0) as [
				{
					where: { username_email: object };
					create: { homepage: string | null };
				},
			];
			expect(arg.where.username_email).toEqual({
				username: 'bob',
				email: 'bob@e.com',
			});
			expect(arg.create.homepage).toBe('https://bob.dev'); // trimmed
		});

		it('lowercases username/email into usernameLower/emailLower on create, for case-insensitive sorting', async () => {
			prisma.author.findUnique.mockResolvedValue(null);

			await service.findOrCreate({
				username: 'TestUser1',
				email: 'TestUser1@Example.COM',
			});

			const [arg] = prisma.author.upsert.mock.calls.at(0) as [
				{ create: { usernameLower: string; emailLower: string } },
			];
			expect(arg.create.usernameLower).toBe('testuser1');
			expect(arg.create.emailLower).toBe('testuser1@example.com');
		});

		it('rejects a banned identity before any write', async () => {
			prisma.author.findUnique.mockResolvedValue({ isBanned: true });

			await expect(
				service.findOrCreate({ username: 'bad', email: 'bad@e.com' }),
			).rejects.toBeInstanceOf(ForbiddenException);
			expect(prisma.author.upsert).not.toHaveBeenCalled();
		});
	});

	describe('ban', () => {
		it('sets isBanned on an existing author', async () => {
			prisma.author.findUnique.mockResolvedValue({ id: 'a1' });

			const result = await service.ban('a1');

			expect(prisma.author.update).toHaveBeenCalledWith({
				where: { id: 'a1' },
				data: { isBanned: true },
			});
			expect(result.isBanned).toBe(true);
		});

		it('404s for an unknown author', async () => {
			prisma.author.findUnique.mockResolvedValue(null);
			await expect(service.ban('nope')).rejects.toBeInstanceOf(
				NotFoundException,
			);
		});
	});
});
