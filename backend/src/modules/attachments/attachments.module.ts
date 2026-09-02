import { Module } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { AttachmentsResolver } from './attachments.resolver';

@Module({
	providers: [AttachmentsResolver, AttachmentsService],
	exports: [AttachmentsService],
})
export class AttachmentsModule {}
