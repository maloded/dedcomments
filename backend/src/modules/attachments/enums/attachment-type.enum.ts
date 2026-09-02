import { registerEnumType } from '@nestjs/graphql';
import { AttachmentType } from '@prisma/client';

// Re-export the Prisma enum and expose it to the GraphQL schema.
export { AttachmentType };

registerEnumType(AttachmentType, {
	name: 'AttachmentType',
	description: 'Kind of comment attachment: an image or a text file.',
});
