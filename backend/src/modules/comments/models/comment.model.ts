import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { AuthorModel } from '../../authors/models/author.model';

/**
 * A single comment. The root-list query (next step) returns these with
 * `repliesCount` populated but no nested `replies`; the thread query will return
 * a nested variant.
 */
@ObjectType()
export class CommentModel {
	@Field(() => ID)
	public id: string;

	@Field(() => String)
	public text: string;

	@Field(() => ID, {
		nullable: true,
		description: 'null for a top-level comment, otherwise the parent id.',
	})
	public parentId: string | null;

	@Field(() => AuthorModel)
	public author: AuthorModel;

	@Field(() => Int, {
		description:
			'Number of direct (non-hidden) replies. 0 on a freshly created comment.',
	})
	public repliesCount: number;

	@Field(() => Date)
	public createdAt: Date;
}
