import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
	ClientsModule,
	type ClientProvider,
	Transport,
} from '@nestjs/microservices';

import { AttachmentsService } from './attachments.service';
import { AttachmentsResolver } from './attachments.resolver';
import { AttachmentsConsumer } from './attachments.consumer';
import { AttachmentStorageService } from './storage/attachment-storage.service';
import { ImageProcessingService } from './image/image-processing.service';
import { ATTACHMENT_QUEUE_CLIENT } from './attachments.constants';

@Module({
	imports: [
		ClientsModule.registerAsync([
			{
				name: ATTACHMENT_QUEUE_CLIENT,
				imports: [ConfigModule],
				inject: [ConfigService],
				useFactory: (config: ConfigService): ClientProvider => ({
					transport: Transport.RMQ,
					options: {
						urls: [config.getOrThrow<string>('RABBITMQ_URL')],
						queue: config.getOrThrow<string>(
							'RABBITMQ_ATTACHMENTS_QUEUE',
						),
						queueOptions: { durable: true },
					},
				}),
			},
		]),
	],
	controllers: [AttachmentsConsumer],
	providers: [
		AttachmentsResolver,
		AttachmentsService,
		AttachmentStorageService,
		ImageProcessingService,
	],
	exports: [AttachmentsService],
})
export class AttachmentsModule {}
