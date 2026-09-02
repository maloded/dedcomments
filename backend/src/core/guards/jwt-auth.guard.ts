import {
	type CanActivate,
	type ExecutionContext,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import { AuthService } from '../../modules/auth/auth.service';

/**
 * Guards moderator-only resolvers. Reads `Authorization: Bearer <jwt>` out of the
 * GraphQL request context, verifies it, loads the `Moderator`, and attaches it to
 * `req.user` (readable via `@CurrentUser()`).
 *
 * Applied per-resolver with `@UseGuards(JwtAuthGuard)` — never globally.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
	public constructor(private readonly authService: AuthService) {}

	public async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = GqlExecutionContext.create(context).getContext<{
			req: Request & { user?: unknown };
		}>().req;

		const header = request.headers.authorization ?? '';
		const [scheme, token] = header.split(' ');
		if (scheme?.toLowerCase() !== 'bearer' || !token) {
			throw new UnauthorizedException(
				'Missing `Authorization: Bearer <token>` header.',
			);
		}

		request.user = await this.authService.verifyModerator(token);
		return true;
	}
}
