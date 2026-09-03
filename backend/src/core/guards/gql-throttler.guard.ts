import { type ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext, type GqlContextType } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';

/**
 * `@nestjs/throttler`'s guard pulls the request/response from the HTTP context;
 * under GraphQL they live on the Gql context instead. Registered globally as an
 * `APP_GUARD` — the global limit applies to every GraphQL operation, and
 * `@Throttle()` on a resolver tightens it for that field.
 *
 * Being global (`APP_GUARD`) means Nest also runs it in front of every RPC
 * message handler (the RabbitMQ `AttachmentsConsumer`'s `@EventPattern`), which
 * has no HTTP/GraphQL request to read — `getRequestResponse` would throw.
 * `shouldSkip` opts out of anything that isn't a GraphQL context *before*
 * `getRequestResponse` is ever reached, so the queue consumer runs unthrottled.
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
	protected override shouldSkip(context: ExecutionContext): Promise<boolean> {
		return Promise.resolve(context.getType<GqlContextType>() !== 'graphql');
	}

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
