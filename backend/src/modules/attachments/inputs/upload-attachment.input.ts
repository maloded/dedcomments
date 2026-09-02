import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * File upload payload. We accept the bytes base64-encoded inside a normal GraphQL
 * mutation rather than wiring `graphql-upload` (multipart) — see
 * docs/code-style-reference.md → "Attachment uploads" for why. Attachment size
 * limits here are tiny (text ≤ 100 KB, images get resized to 320×240), so the
 * ~33% base64 overhead is irrelevant.
 */
@InputType()
export class UploadAttachmentInput {
	@Field(() => String, {
		description:
			'Original file name — its extension is validated and it is kept for display.',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(255)
	public filename: string;

	@Field(() => String, {
		description:
			'MIME type: image/jpeg | image/png | image/gif | text/plain.',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	public mimeType: string;

	@Field(() => String, {
		description:
			'File bytes, base64-encoded. A `data:<mime>;base64,` prefix is also accepted.',
	})
	@IsString()
	@IsNotEmpty()
	public data: string;
}
