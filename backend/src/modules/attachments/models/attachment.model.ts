import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { AttachmentType } from '../enums/attachment-type.enum';

/**
 * Public view of a comment's single attachment. `processedAt` is null until the
 * RabbitMQ worker has resized/validated the file.
 */
@ObjectType()
export class AttachmentModel {
	@Field(() => ID)
	public id: string;

	@Field(() => AttachmentType)
	public type: AttachmentType;

	@Field(() => String)
	public url: string;

	@Field(() => String)
	public originalName: string;

	@Field(() => Int, { description: 'Size in bytes.' })
	public size: number;

	@Field(() => Date, { nullable: true })
	public processedAt: Date | null;
}
