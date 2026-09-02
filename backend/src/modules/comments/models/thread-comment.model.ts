import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { AuthorModel } from '../../authors/models/author.model';
import { AttachmentModel } from '../../attachments/models/attachment.model';

/**
 * A node in a comment thread. Returned by `commentThread(rootId)` — the root
 * comment with its entire subtree nested under `replies`, at any depth.
 * Replies within a level are ordered newest-first (LIFO, brief §5).
 */
@ObjectType()
export class ThreadCommentModel {
	@Field(() => ID)
	public id: string;

	@Field(() => String)
	public text: string;

	@Field(() => ID, { nullable: true })
	public parentId: string | null;

	@Field(() => AuthorModel)
	public author: AuthorModel;

	@Field(() => AttachmentModel, { nullable: true })
	public attachment: AttachmentModel | null;

	@Field(() => Int, {
		description: 'Number of direct replies (= replies.length).',
	})
	public repliesCount: number;

	@Field(() => Date)
	public createdAt: Date;

	@Field(() => [ThreadCommentModel], {
		description: 'Direct replies, newest first.',
	})
	public replies: ThreadCommentModel[];
}
