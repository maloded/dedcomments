import { Field, ID, ObjectType } from '@nestjs/graphql';

/** A moderator account — no password hash is ever exposed. */
@ObjectType()
export class ModeratorModel {
	@Field(() => ID)
	public id: string;

	@Field(() => String)
	public username: string;

	@Field(() => Date)
	public createdAt: Date;
}
