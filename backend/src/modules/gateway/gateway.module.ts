import { Module } from '@nestjs/common';
import { CommentsGateway } from './comments.gateway';

@Module({
	providers: [CommentsGateway],
	exports: [CommentsGateway],
})
export class GatewayModule {}
