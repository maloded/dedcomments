import { Field, ObjectType } from '@nestjs/graphql';

/**
 * A freshly generated CAPTCHA. The frontend renders `image` (an SVG data URL)
 * and submits `token` + the user's reading back through `createComment`.
 */
@ObjectType()
export class CaptchaChallengeModel {
	@Field(() => String, {
		description: 'Opaque one-time token; pass it back as `captchaToken`.',
	})
	public token: string;

	@Field(() => String, {
		description: 'SVG image as a `data:image/svg+xml;base64,…` URL.',
	})
	public image: string;

	@Field(() => Date, {
		description:
			'After this instant the challenge can no longer be solved.',
	})
	public expiresAt: Date;
}
