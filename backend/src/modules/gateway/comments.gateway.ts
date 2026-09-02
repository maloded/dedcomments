import { Injectable } from '@nestjs/common';

// step 4: becomes a NestJS @WebSocketGateway (needs @nestjs/websockets +
// @nestjs/platform-socket.io). Emits `commentCreated` to connected clients so the
// root list updates live. Kept as a plain provider for now to avoid pulling in the
// WS transport before it is wired up.
@Injectable()
export class CommentsGateway {
	public emitCommentCreated(): void {
		// no-op until the WS transport is added
	}
}
