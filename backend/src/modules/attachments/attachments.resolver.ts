import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { AttachmentsService } from './attachments.service';
import { UploadAttachmentInput } from './inputs/upload-attachment.input';
import { AttachmentModel } from './models/attachment.model';

@Resolver(() => AttachmentModel)
export class AttachmentsResolver {
	public constructor(
		private readonly attachmentsService: AttachmentsService,
	) {}

	@Mutation(() => AttachmentModel, {
		name: 'uploadAttachment',
		description:
			'Upload one image (JPG/GIF/PNG) or text file (.txt ≤ 100 KB). Images ' +
			'are resized to fit 320×240 on a background queue; check `processedAt`. ' +
			'Pass the returned `id` to `createComment(attachmentId:)` to attach it.',
	})
	public uploadAttachment(
		@Args('input') input: UploadAttachmentInput,
	): Promise<AttachmentModel> {
		return this.attachmentsService.upload(input);
	}
}
