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
}
