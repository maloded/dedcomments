import { Injectable } from '@nestjs/common';
import type { Author } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface AuthorIdentity {
	username: string;
	email: string;
	homepage?: string | null;
}

@Injectable()
export class AuthorsService {
	public constructor(private readonly prismaService: PrismaService) {}

	/**
	 * Find the Author row for this (username, email) identity or create it.
	 * Uses the `@@unique([username, email])` constraint so concurrent first
	 * comments from the same person don't create duplicates. A newly supplied
	 * homepage overwrites the stored one.
	 */
	public async findOrCreate(identity: AuthorIdentity): Promise<Author> {
		const { username, email } = identity;
		const homepage = identity.homepage?.trim() || null;

		return this.prismaService.author.upsert({
			where: { username_email: { username, email } },
			create: { username, email, homepage },
			update: homepage ? { homepage } : {},
		});
	}
}
