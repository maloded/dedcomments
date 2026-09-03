import { Logger } from '@nestjs/common';
import {
	OnGatewayConnection,
	OnGatewayDisconnect,
	WebSocketGateway,
	WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { CommentModel } from '../comments/models/comment.model';

/** Event name clients subscribe to for live comment updates. */
export const COMMENT_CREATED_EVENT = 'commentCreated';

/** Event name clients subscribe to when a moderator hides a comment. */
export const COMMENT_HIDDEN_EVENT = 'commentHidden';

/** Event name clients subscribe to when a moderator bans an author identity. */
export const AUTHOR_BANNED_EVENT = 'authorBanned';

/** Minimal payload for `commentHidden` — enough for a client to remove the
 * comment from wherever it's rendered and, via `parentId`, know whose
 * `repliesCount` to decrement (or that it was a root, whose row disappears
 * from the list entirely). Mirrors `commentCreated`'s shape on purpose. */
export interface CommentHiddenPayload {
	id: string;
	parentId: string | null;
}

/** Minimal payload for `authorBanned` — enough to identify the author (e.g.
 * for a "so-and-so was banned" notice); no comment data, since banning
 * doesn't retroactively touch any existing comment (brief: "existing
 * comments stay"). */
export interface AuthorBannedPayload {
	id: string;
	username: string;
}

/**
 * Socket.IO gateway for live updates. Anonymous — no auth on the connection
 * (viewers just want the feed) — and a single broadcast room: every connected
 * client gets every `commentCreated`. Shares the app's HTTP port (`/socket.io/`).
 *
 * CORS is open here on purpose: the socket only ever broadcasts data that is
 * already public via the GraphQL API, and it carries no credentials.
 */
@WebSocketGateway({
	cors: { origin: true },
	transports: ['websocket', 'polling'],
})
export class CommentsGateway
	implements OnGatewayConnection, OnGatewayDisconnect
{
	private readonly logger = new Logger(CommentsGateway.name);

	@WebSocketServer()
	private readonly server: Server;

	public handleConnection(client: Socket): void {
		this.logger.debug(`ws connect ${client.id}`);
	}

	public handleDisconnect(client: Socket): void {
		this.logger.debug(`ws disconnect ${client.id}`);
	}

	/** Broadcast a freshly created comment to every connected client. */
	public emitCommentCreated(comment: CommentModel): void {
		this.server.emit(COMMENT_CREATED_EVENT, comment);
	}

	/** Broadcast that a comment was hidden by a moderator. */
	public emitCommentHidden(payload: CommentHiddenPayload): void {
		this.server.emit(COMMENT_HIDDEN_EVENT, payload);
	}

	/** Broadcast that an author identity was banned by a moderator. */
	public emitAuthorBanned(payload: AuthorBannedPayload): void {
		this.server.emit(AUTHOR_BANNED_EVENT, payload);
	}
}
