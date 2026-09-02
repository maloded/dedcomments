import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { CREATE_COMMENT_RATE_LIMIT } from '../../shared/constants';
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
			'counts. Default order: newest first (LIFO). Hidden comments excluded.',
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
			'Replies are newest-first at every level. Hidden comments (and their ' +
			'subtrees) are excluded.',
	})
	public commentThread(
		@Args('rootId', { type: () => ID }) rootId: string,
	): Promise<ThreadCommentModel> {
		return this.commentsService.getCommentThread(rootId);
	}

	@Throttle({ default: CREATE_COMMENT_RATE_LIMIT })
	@Mutation(() => CommentModel, {
		name: 'createComment',
		description:
			'Post a comment (or a reply, via `parentId`). Requires a solved ' +
			'CAPTCHA. Rate-limited. Also broadcasts a `commentCreated` socket event.',
	})
	public createComment(
		@Args('input') input: CreateCommentInput,
	): Promise<CommentModel> {
		return this.commentsService.createComment(input);
	}

	@UseGuards(JwtAuthGuard)
	@Mutation(() => CommentModel, {
		name: 'hideComment',
		description:
			'Moderator only. Hide a comment — it disappears from `rootComments` ' +
			'and `commentThread`. Requires `Authorization: Bearer <jwt>`.',
	})
	public hideComment(
		@Args('commentId', { type: () => ID }) commentId: string,
	): Promise<CommentModel> {
		return this.commentsService.hideComment(commentId);
	}
}
