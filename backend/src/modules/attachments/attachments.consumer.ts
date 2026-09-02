import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { AttachmentsService } from './attachments.service';
import { ATTACHMENT_RESIZE_PATTERN } from './attachments.constants';

interface ResizeJob {
	attachmentId: string;
}

/**
 * RabbitMQ consumer (same process as the API — this is a monolith). Picks up
 * `attachment.resize` jobs and resizes the image out of the request path.
 * Manual ack: on an unrecoverable error we `nack` **without requeue** — a corrupt
 * image won't fix itself, so retrying forever is pointless.
 */
@Controller()
export class AttachmentsConsumer {
	private readonly logger = new Logger(AttachmentsConsumer.name);

	public constructor(
		private readonly attachmentsService: AttachmentsService,
	) {}

	@EventPattern(ATTACHMENT_RESIZE_PATTERN)
	public async onResizeJob(
		@Payload() job: ResizeJob,
		@Ctx() context: RmqContext,
	): Promise<void> {
		const channel = context.getChannelRef() as {
			ack: (msg: unknown) => void;
			nack: (msg: unknown, allUpTo: boolean, requeue: boolean) => void;
		};
		const message = context.getMessage();

		try {
			await this.attachmentsService.processImage(job.attachmentId);
			channel.ack(message);
		} catch (error) {
			this.logger.error(
				`resize failed for "${job?.attachmentId}": ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			channel.nack(message, false, false);
		}
	}
}
