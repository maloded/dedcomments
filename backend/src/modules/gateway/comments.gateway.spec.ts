import {
	AUTHOR_BANNED_EVENT,
	COMMENT_CREATED_EVENT,
	COMMENT_HIDDEN_EVENT,
	CommentsGateway,
} from './comments.gateway';
import type { CommentModel } from '../comments/models/comment.model';

describe('CommentsGateway', () => {
	function gatewayWithFakeServer(): {
		gateway: CommentsGateway;
		emit: jest.Mock;
	} {
		const gateway = new CommentsGateway();
		const emit = jest.fn();
		// @ts-expect-error — inject a fake socket.io server
		gateway.server = { emit };
		return { gateway, emit };
	}

	it('broadcasts commentCreated with the comment payload', () => {
		const { gateway, emit } = gatewayWithFakeServer();

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
			attachment: null,
			repliesCount: 0,
			createdAt: new Date(),
		} satisfies CommentModel;

		gateway.emitCommentCreated(comment);

		expect(emit).toHaveBeenCalledWith(COMMENT_CREATED_EVENT, comment);
	});

	it('broadcasts commentHidden with the id and parentId', () => {
		const { gateway, emit } = gatewayWithFakeServer();

		gateway.emitCommentHidden({ id: 'c1', parentId: 'root-1' });

		expect(emit).toHaveBeenCalledWith(COMMENT_HIDDEN_EVENT, {
			id: 'c1',
			parentId: 'root-1',
		});
	});

	it('broadcasts authorBanned with the author id and username', () => {
		const { gateway, emit } = gatewayWithFakeServer();

		gateway.emitAuthorBanned({ id: 'a1', username: 'bob' });

		expect(emit).toHaveBeenCalledWith(AUTHOR_BANNED_EVENT, {
			id: 'a1',
			username: 'bob',
		});
	});
});
