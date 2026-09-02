import { join } from 'node:path';
import type { ApolloDriverConfig } from '@nestjs/apollo';
import { ConfigService } from '@nestjs/config';
import {
	ApolloServerPluginLandingPageLocalDefault,
	ApolloServerPluginLandingPageProductionDefault,
} from '@apollo/server/plugin/landingPage/default';

// Code-first GraphQL: the schema is generated from decorators and written to
// src/schema.gql (committed, so the frontend codegen has a stable artifact).
export function getGraphQLConfig(
	configService: ConfigService,
): ApolloDriverConfig {
	const isDev = configService.get<string>('NODE_ENV') !== 'production';

	return {
		autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
		sortSchema: true,
		// The classic graphql-playground plugin is not compatible with Apollo
		// Server 5, so we serve Apollo's embedded Sandbox at /graphql instead.
		playground: false,
		plugins: [
			isDev
				? ApolloServerPluginLandingPageLocalDefault({ embed: true })
				: ApolloServerPluginLandingPageProductionDefault(),
		],
		context: ({ req, res }: { req: unknown; res: unknown }) => ({
			req,
			res,
		}),
	};
}
