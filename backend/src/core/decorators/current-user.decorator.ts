import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

/**
 * Injects the authenticated principal (set on `req.user` by the JWT/Moderator
 * guard, added in a later step) into a resolver argument.
 *
 *   @Query(() => ModeratorModel)
 *   me(@CurrentUser() moderator: Moderator) { ... }
 *   me(@CurrentUser('id') moderatorId: string) { ... }
 */
export const CurrentUser = createParamDecorator(
	(data: string | undefined, context: ExecutionContext): unknown => {
		const ctx = GqlExecutionContext.create(context);
		const user = ctx.getContext<{
			req?: { user?: Record<string, unknown> };
		}>().req?.user;

		return data && user ? user[data] : user;
	},
);
