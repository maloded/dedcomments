import { COMMENT_CREATED_EVENT, CommentsGateway } from './comments.gateway';
import type { CommentModel } from '../comments/models/comment.model';

describe('CommentsGateway', () => {
	it('broadcasts commentCreated with the comment payload', () => {
		const gateway = new CommentsGateway();
		const emit = jest.fn();
		// @ts-expect-error — inject a fake socket.io server
		gateway.server = { emit };

		const comment = {
			id: 'c1',
			text: 'hi',
			parentId: null,
			author: {
				id: 'a1',
				username: 'bob',
				email: 'bob@e.com',
				homepage: null,
				isBanned: false,
				createdAt: new Date(),
			},
			repliesCount: 0,
			createdAt: new Date(),
		} satisfies CommentModel;

		gateway.emitCommentCreated(comment);

		expect(emit).toHaveBeenCalledWith(COMMENT_CREATED_EVENT, comment);
	});
});
