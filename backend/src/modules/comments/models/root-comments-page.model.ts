import { Field, Int, ObjectType } from '@nestjs/graphql';
import { CommentModel } from './comment.model';

/**
 * One page of top-level comments. `items` carry `repliesCount` (direct replies)
 * but no nested `replies` — the tree is fetched separately via `commentThread`.
 */
@ObjectType()
export class RootCommentsPage {
	@Field(() => [CommentModel])
	public items: CommentModel[];

	@Field(() => Int, { description: 'Total number of top-level comments.' })
	public totalCount: number;

	@Field(() => Int, { description: '1-based current page.' })
	public page: number;

	@Field(() => Int, { description: 'Total pages at 25 items per page.' })
	public totalPages: number;
}
