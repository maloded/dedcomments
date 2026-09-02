import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';

import { AppConfigModule } from './config/app-config.module';
import { getGraphQLConfig } from './config/graphql.config';
import { PrismaModule } from './prisma/prisma.module';
import { GraphqlExceptionFilter } from './filters/graphql-exception.filter';
import { GqlThrottlerGuard } from './guards/gql-throttler.guard';
import { GLOBAL_RATE_LIMIT } from '../shared/constants';

/**
 * Cross-cutting infrastructure wired once and shared app-wide:
 *   - validated configuration (`AppConfigModule`)
 *   - the GraphQL runtime (code-first, Apollo driver)
 *   - the Prisma client (`PrismaModule` is `@Global`)
 *   - a global exception filter for consistent GraphQL errors
 *   - a global (GraphQL-aware) rate-limit guard
 *
 * Feature modules live under `src/modules/` and are imported by `AppModule`.
 */
@Module({
	imports: [
		AppConfigModule,
		ThrottlerModule.forRoot({
			throttlers: [GLOBAL_RATE_LIMIT],
			// e2e specs seed many comments in a tight loop — turn the limiter off
			// there (the limits themselves are covered by unit tests + manual QA).
			skipIf: () => process.env.THROTTLE_DISABLED === 'true',
		}),
		GraphQLModule.forRootAsync<ApolloDriverConfig>({
			driver: ApolloDriver,
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: getGraphQLConfig,
		}),
		PrismaModule,
	],
	providers: [
		{ provide: APP_FILTER, useClass: GraphqlExceptionFilter },
		{ provide: APP_GUARD, useClass: GqlThrottlerGuard },
	],
})
export class CoreModule {}
