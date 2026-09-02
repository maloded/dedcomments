import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CommentsService } from './comments.service';
import { CreateCommentInput } from './inputs/create-comment.input';
import { RootCommentsArgs } from './inputs/root-comments.args';
import { CommentModel } from './models/comment.model';
import { RootCommentsPage } from './models/root-comments-page.model';
import { ThreadCommentModel } from './models/thread-comment.model';

@Resolver(() => CommentModel)
export class CommentsResolver {
	public constructor(private readonly commentsService: CommentsService) {}

	@Query(() => RootCommentsPage, {
		name: 'rootComments',
		description:
			'Paginated list of top-level comments (25/page) with per-item reply ' +
			'counts. Default order: newest first (LIFO).',
	})
	public rootComments(
		@Args() args: RootCommentsArgs,
	): Promise<RootCommentsPage> {
		return this.commentsService.getRootComments(args);
	}

	@Query(() => ThreadCommentModel, {
		name: 'commentThread',
		description:
			'The full reply tree for one top-level comment, in a single request. ' +
			'Replies are newest-first at every level.',
	})
	public commentThread(
		@Args('rootId', { type: () => ID }) rootId: string,
	): Promise<ThreadCommentModel> {
		return this.commentsService.getCommentThread(rootId);
	}

	@Mutation(() => CommentModel, {
		name: 'createComment',
		description:
			'Post a comment (or a reply, via `parentId`). Requires a solved ' +
			'CAPTCHA. Returns the created comment.',
	})
	public createComment(
		@Args('input') input: CreateCommentInput,
	): Promise<CommentModel> {
		return this.commentsService.createComment(input);
	}
}
