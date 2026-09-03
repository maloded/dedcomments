import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
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
	 *
	 * A **banned** identity is rejected here — this is the choke point every
	 * `createComment` goes through.
	 *
	 * This is also the only place `username`/`email` are ever written, so it's
	 * the one spot responsible for keeping `usernameLower`/`emailLower` (used by
	 * `rootComments`' case-insensitive sort — see code-style-reference.md →
	 * "Case-insensitive sorting") in sync. `username`/`email` never change after
	 * a row is created (they're the identity), so this only needs to run on insert.
	 */
	public async findOrCreate(identity: AuthorIdentity): Promise<Author> {
		const { username, email } = identity;
		const homepage = identity.homepage?.trim() || null;

		const existing = await this.prismaService.author.findUnique({
			where: { username_email: { username, email } },
			select: { isBanned: true },
		});
		if (existing?.isBanned) {
			throw new ForbiddenException(
				'This author (username + e-mail) has been banned from commenting.',
			);
		}

		return this.prismaService.author.upsert({
			where: { username_email: { username, email } },
			create: {
				username,
				email,
				homepage,
				usernameLower: username.toLowerCase(),
				emailLower: email.toLowerCase(),
			},
			update: homepage ? { homepage } : {},
		});
	}

	/** Ban an author identity (moderator only). Their existing comments stay. */
	public async ban(authorId: string): Promise<Author> {
		const author = await this.prismaService.author.findUnique({
			where: { id: authorId },
			select: { id: true },
		});
		if (!author) {
			throw new NotFoundException(`Author "${authorId}" was not found.`);
		}

		return this.prismaService.author.update({
			where: { id: authorId },
			data: { isBanned: true },
		});
	}
}
