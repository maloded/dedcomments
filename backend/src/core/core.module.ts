import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';

import { AppConfigModule } from './config/app-config.module';
import { getGraphQLConfig } from './config/graphql.config';
import { PrismaModule } from './prisma/prisma.module';
import { GraphqlExceptionFilter } from './filters/graphql-exception.filter';

/**
 * Cross-cutting infrastructure wired once and shared app-wide:
 *   - validated configuration (`AppConfigModule`)
 *   - the GraphQL runtime (code-first, Apollo driver)
 *   - the Prisma client (`PrismaModule` is `@Global`)
 *   - a global exception filter for consistent GraphQL errors
 *
 * Feature modules live under `src/modules/` and are imported by `AppModule`.
 */
@Module({
	imports: [
		AppConfigModule,
		GraphQLModule.forRootAsync<ApolloDriverConfig>({
			driver: ApolloDriver,
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: getGraphQLConfig,
		}),
		PrismaModule,
	],
	providers: [{ provide: APP_FILTER, useClass: GraphqlExceptionFilter }],
})
export class CoreModule {}
