import { Query, Resolver } from '@nestjs/graphql';
import { CommentsService } from './comments.service';

@Resolver()
export class CommentsResolver {
	public constructor(private readonly commentsService: CommentsService) {}

	// Placeholder so the code-first schema has at least one Query while the real
	// resolvers (rootComments / commentThread / createComment) are built in step 2.
	@Query(() => String, { name: 'health' })
	public health(): string {
		return 'ok';
	}
}
