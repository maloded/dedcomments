import { Field, ObjectType } from '@nestjs/graphql';
import { ModeratorModel } from './moderator.model';

/** Result of `moderatorLogin` — a bearer token + who it belongs to. */
@ObjectType()
export class AuthPayload {
	@Field(() => String, {
		description:
			'JWT — send as `Authorization: Bearer <token>` on guarded mutations.',
	})
	public accessToken: string;

	@Field(() => ModeratorModel)
	public moderator: ModeratorModel;
}
