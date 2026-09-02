import {
	type ArgumentsHost,
	Catch,
	HttpException,
	Logger,
} from '@nestjs/common';
import { GqlArgumentsHost, type GqlExceptionFilter } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';

/**
 * Global, GraphQL-aware exception filter. Turns every thrown error into a
 * consistent `GraphQLError` shape:
 *   - `HttpException` (thrown from services, e.g. NotFoundException) → its message
 *     plus an `extensions.code` derived from the class name.
 *   - anything else → a generic "Internal server error" (never leak internals),
 *     with the real error logged server-side.
 *
 * Validation errors from the global `ValidationPipe` are `BadRequestException`s,
 * so they flow through the first branch with `code: BAD_REQUEST`.
 */
@Catch()
export class GraphqlExceptionFilter implements GqlExceptionFilter {
	private readonly logger = new Logger(GraphqlExceptionFilter.name);

	public catch(exception: unknown, host: ArgumentsHost): GraphQLError {
		const gqlHost = GqlArgumentsHost.create(host);
		const field =
			gqlHost.getInfo<{ fieldName?: string }>()?.fieldName ?? '?';

		if (exception instanceof GraphQLError) {
			return exception;
		}

		if (exception instanceof HttpException) {
			const response = exception.getResponse();
			const rawMessage =
				typeof response === 'string'
					? response
					: ((response as { message?: string | string[] }).message ??
						exception.message);
			const message = Array.isArray(rawMessage)
				? rawMessage.join('; ')
				: rawMessage;

			this.logger.warn(
				`[${field}] ${exception.constructor.name}: ${message}`,
			);

			return new GraphQLError(message, {
				extensions: {
					code: exception.constructor.name
						.replace(/Exception$/, '')
						.replace(/([a-z])([A-Z])/g, '$1_$2')
						.toUpperCase(),
					statusCode: exception.getStatus(),
				},
			});
		}

		this.logger.error(
			`[${field}] Unhandled exception`,
			exception instanceof Error ? exception.stack : String(exception),
		);

		return new GraphQLError('Internal server error', {
			extensions: { code: 'INTERNAL_SERVER_ERROR' },
		});
	}
}
