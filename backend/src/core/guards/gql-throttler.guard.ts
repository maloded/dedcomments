import { type ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';

/**
 * `@nestjs/throttler`'s guard pulls the request/response from the HTTP context;
 * under GraphQL they live on the Gql context instead. Registered globally as an
 * `APP_GUARD` — the global limit applies to every operation, and `@Throttle()`
 * on a resolver tightens it for that field.
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
	protected getRequestResponse(context: ExecutionContext): {
		req: Request;
		res: Response;
	} {
		const gqlCtx = GqlExecutionContext.create(context).getContext<{
			req: Request;
			res?: Response;
		}>();
		return { req: gqlCtx.req, res: gqlCtx.res ?? gqlCtx.req.res! };
	}
}
