import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { CommentsService } from './comments.service';
import { CreateCommentInput } from './inputs/create-comment.input';
import { CommentModel } from './models/comment.model';

@Resolver(() => CommentModel)
export class CommentsResolver {
	public constructor(private readonly commentsService: CommentsService) {}

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
