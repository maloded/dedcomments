import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Resolver } from '@nestjs/graphql';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { AuthorsService } from './authors.service';
import { AuthorModel } from './models/author.model';

@Resolver(() => AuthorModel)
export class AuthorsResolver {
	public constructor(private readonly authorsService: AuthorsService) {}

	@UseGuards(JwtAuthGuard)
	@Mutation(() => AuthorModel, {
		name: 'banAuthor',
		description:
			'Moderator only. Ban an author identity (username + e-mail) — their ' +
			'existing comments stay, but they can post no new ones. Requires ' +
			'`Authorization: Bearer <jwt>`.',
	})
	public banAuthor(
		@Args('authorId', { type: () => ID }) authorId: string,
	): Promise<AuthorModel> {
		return this.authorsService.ban(authorId);
	}
}
