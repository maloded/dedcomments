import { Field, ID, ObjectType } from '@nestjs/graphql';
import type { Author } from '@prisma/client';

/**
 * Public view of a comment author. Not an account — just the identity
 * (username + email) captured when a comment was posted.
 *
 * `email` is exposed because the brief's root-comment table displays and sorts
 * by it (§3.2). A production system would hash it / show a gravatar instead.
 */
@ObjectType()
export class AuthorModel implements Pick<
	Author,
	'id' | 'username' | 'email' | 'homepage' | 'createdAt'
> {
	@Field(() => ID)
	public id: string;

	@Field(() => String)
	public username: string;

	@Field(() => String)
	public email: string;

	@Field(() => String, { nullable: true })
	public homepage: string | null;

	@Field(() => Date)
	public createdAt: Date;
}
