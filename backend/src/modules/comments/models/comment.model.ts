import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { AuthorModel } from '../../authors/models/author.model';
import { AttachmentModel } from '../../attachments/models/attachment.model';

/**
 * A single comment. The root-list query returns these with `repliesCount` and
 * the comment's own `attachment` populated, but no nested `replies` — a root
 * row's own text/attachment must be visible without fetching its subtree (see
 * CLAUDE.md's fix entry for this); the thread query returns a nested variant.
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

	@Field(() => AttachmentModel, { nullable: true })
	public attachment: AttachmentModel | null;

	@Field(() => Int, {
		description:
			'Number of direct (non-hidden) replies. 0 on a freshly created comment.',
	})
	public repliesCount: number;

	@Field(() => Date)
	public createdAt: Date;
}
