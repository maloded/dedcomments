import { Resolver } from '@nestjs/graphql';
import { AttachmentsService } from './attachments.service';

@Resolver()
export class AttachmentsResolver {
	public constructor(
		private readonly attachmentsService: AttachmentsService,
	) {}
}
