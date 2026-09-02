import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ModeratorLoginInput } from './inputs/moderator-login.input';
import { AuthPayload } from './models/auth-payload.model';
import { LOGIN_RATE_LIMIT } from '../../shared/constants';

@Resolver(() => AuthPayload)
export class AuthResolver {
	public constructor(private readonly authService: AuthService) {}

	@Throttle({ default: LOGIN_RATE_LIMIT })
	@Mutation(() => AuthPayload, {
		name: 'moderatorLogin',
		description:
			'Exchange moderator username + password for a JWT. Rate-limited.',
	})
	public moderatorLogin(
		@Args('input') input: ModeratorLoginInput,
	): Promise<AuthPayload> {
		return this.authService.moderatorLogin(input);
	}
}
