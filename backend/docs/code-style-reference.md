# Code Style Reference

Conventions distilled from the author's prior NestJS projects **DedStream**
(`../DedStream/dedstream-back` — GraphQL/Apollo + Prisma + PostgreSQL + Redis, closest
stack match) and **DedCinema** (`../dedcinema/backend` — multi-service, RabbitMQ, Docker
Compose). This file is the single source of truth for style from now on — the sibling
projects are **not** to be re-read unless explicitly requested.

## Formatting (Prettier)

Mirrors DedStream's `.prettierrc`:

```json
{
  "trailingComma": "all",
  "tabWidth": 4,
  "useTabs": true,
  "semi": true,
  "singleQuote": true,
  "jsxSingleQuote": true,
  "arrowParens": "avoid"
}
```

- Tabs for indentation, width 4.
- Single quotes, semicolons, trailing commas everywhere.
- `arrowParens: avoid` → `x => x`, not `(x) => x`.

## Linting

- ESLint flat config (`eslint.config.mjs`), `typescript-eslint` recommendedTypeChecked +
  `eslint-plugin-prettier/recommended`.
- `@typescript-eslint/no-explicit-any` is **off**; several `no-unsafe-*` rules relaxed to
  `warn`/`off`. Pragmatism over purity.
- `prettier/prettier` is an error — formatting is enforced by lint.

## TypeScript

- `module` / `moduleResolution`: `nodenext`. **No `"type": "module"`** in `package.json` —
  the project compiles as CommonJS, so relative imports have **no `.js` extension**.
- `strictNullChecks: true`, but `noImplicitAny: false` and `strictBindCallApply: false`.
- Path alias in DedStream is `@/*` → project root. For this project we keep imports
  relative (small module count); revisit if nesting gets deep.

## Folder layout

`core` / `shared` / `modules`, same split DedStream uses:

```
src/
  main.ts
  app.module.ts          # imports CoreModule + every feature module
  schema.gql             # generated (code-first, committed)

  core/                  # cross-cutting infrastructure, wired once
    core.module.ts       # config + GraphQL + Prisma + global APP_FILTER
    config/
      app-config.module.ts   # ConfigModule.forRoot({ isGlobal, validate })
      env.validation.ts      # EnvironmentVariables class + validateEnv()
      graphql.config.ts      # getGraphQLConfig(configService) factory
    prisma/
      prisma.module.ts   # @Global()
      prisma.service.ts  # extends PrismaClient
    filters/
      graphql-exception.filter.ts   # global GqlExceptionFilter
    decorators/
      current-user.decorator.ts     # @CurrentUser() param decorator
    guards/              # JWT / Moderator guards land here (step 4)

  shared/                # reusable building blocks, no feature logic
    dto/
      pagination.args.ts # @ArgsType base: page + sortOrder
    enums/
      sort-order.enum.ts # SortOrder { ASC, DESC } + registerEnumType
    constants/
      pagination.constants.ts   # DEFAULT_PAGE, ROOT_COMMENTS_PER_PAGE (25)
      validation.constants.ts   # USERNAME_REGEX, ALLOWED_HTML_TAGS,
                                # IMAGE_MAX_* , TEXT_FILE_MAX_BYTES, mime lists
      index.ts                  # barrel

  modules/               # one folder per feature
    <feature>/
      <feature>.module.ts
      <feature>.service.ts
      <feature>.resolver.ts     # omitted for internal modules (sanitizer/cache/gateway)
      models/            # GraphQL @ObjectType classes -> <name>.model.ts
      inputs/            # GraphQL @InputType classes   -> <name>.input.ts
    auth/  authors/  comments/  attachments/  captcha/
    sanitizer/  cache/  gateway/
```

Rules:
- A feature module never imports from another feature module's internals — only its
  exported service. Cross-feature primitives go in `shared/`.
- `core/` is imported once (via `CoreModule` in `AppModule`); feature modules rely on
  `@Global()` providers (`PrismaService`, `ConfigService`) rather than importing `core/`.
- `shared/` must stay dependency-free of `core/` and `modules/` (leaf layer).
- Intra-module layout (`*.module/service/resolver.ts` + `models/` + `inputs/`) is exactly
  DedStream's.
- Constants that appear in more than one place (regexes, size limits, page size) live in
  `shared/constants/` — never redefined inline in a validator / sanitizer / resolver.

## Modules

- Infra modules that are needed everywhere are `@Global()` and `exports:` their service
  (see DedStream `PrismaModule`, `RedisModule`).
- A feature module lists `providers: [XxxResolver, XxxService]` and only `exports` a
  service when another module consumes it.
- Config for async module setup lives in `src/core/config/*.config.ts` as a
  `getXxxConfig(configService: ConfigService)` factory passed to `forRootAsync`.
- Env vars are validated at boot by `core/config/env.validation.ts` (a class-validator
  `EnvironmentVariables` class + `validateEnv()` passed to `ConfigModule.forRoot`).
  Missing/malformed required vars crash the process with a readable list.

## Services

- `@Injectable()`, `public constructor(private readonly xxxService: XxxService) {}`.
- Methods are explicitly `public async`.
- Talk to the DB only through `PrismaService` (extends `PrismaClient`).
- Error handling: throw Nest built-in HTTP exceptions directly from the service
  (`NotFoundException`, `UnauthorizedException`, `BadRequestException`, …) with a short
  human message — no custom exception hierarchy, no wrapping in try/catch just to rethrow.

## Resolvers

- `@Resolver()` (or `@Resolver(() => XxxModel)` when it has field resolvers).
- Query/mutation names are set explicitly: `@Query(() => XxxModel, { name: 'findXxx' })`.
- Resolver methods stay thin — one call into the service, no business logic.
- Args: single-field via `@Args('id')`; multi-field via a dedicated `@InputType()` in
  `inputs/`.

## GraphQL models & inputs

- Model: `@ObjectType()` class `XxxModel implements Xxx` (the Prisma-generated type), one
  `@Field()` per column. `@Field(() => ID)` for ids, `@Field(() => Type, { nullable: true })`
  for optional columns.
- Input: `@InputType()` class with a `@Field()` **and** class-validator decorators
  (`@IsString()`, `@IsEmail()`, `@IsOptional()`, `@IsUrl()`, `@Matches()`) on every field.
- Validation runs through a global `ValidationPipe({ transform: true })` in `main.ts`.

## Auth (for the JWT / Moderator step)

DedStream pattern, to adapt:
- Guard in `core/guards/gql-auth.guard.ts` implementing `CanActivate`, pulls the request
  out of `GqlExecutionContext.create(context).getContext().req`.
- `@Authorization()` decorator = `applyDecorators(UseGuards(GqlAuthGuard))`.
- `@CurrentUser()` param decorator (`core/decorators/current-user.decorator.ts`) injects
  the principal (`req.user`) into a resolver arg.
- (DedStream uses Redis-backed sessions; this project uses **JWT** per the brief, so the
  guard verifies a bearer token instead of reading `req.session`.)

## GraphQL config (`core/config/graphql.config.ts`)

- `ApolloDriver`, `autoSchemaFile` → a committed `.gql` file, `sortSchema: true`.
- Old graphql-playground plugin is incompatible with Apollo Server 5 → `playground: false`
  and the embedded Apollo Sandbox landing-page plugin instead (dev only). Served at
  `GET /graphql` for browsers.
- `context: ({ req, res }) => ({ req, res })`.

## Error handling

- Services throw Nest built-in HTTP exceptions (`NotFoundException`, `BadRequestException`,
  `UnauthorizedException`, …) with a short message.
- `core/filters/graphql-exception.filter.ts` is a global `APP_FILTER` (registered in
  `CoreModule`) that normalizes every error into a `GraphQLError` with an
  `extensions.code` (`NOT_FOUND`, `BAD_REQUEST`, `INTERNAL_SERVER_ERROR`, …). Unknown
  errors are logged server-side and returned as a generic "Internal server error".

## Docker Compose (DedCinema pattern)

- One `docker-compose.yml` at the repo root; each backing service gets a
  `container_name`, `restart: always`, a named volume, and lives on a shared user network.
- Service versions are pinned (`postgres:15`, `redis:6.2`, `rabbitmq:3-management`).
- RabbitMQ always uses the `-management` image and publishes `5672` + `15672`.
- Credentials come from `${VARS}` resolved from an env file, never hard-coded.
- App service: multi-stage Dockerfile (`builder` → `runner`), `runner` sets
  `NODE_ENV=production`, copies only `node_modules` + `dist` + `prisma`, runs
  `prisma generate` in the build stage, `CMD ["node", "dist/main"]`.

## Divergences from the sibling projects (deliberate)

- **Prisma 6 + classic query engine + `prisma-client-js` generator + `DATABASE_URL`**,
  not DedStream's Prisma 7 + `@prisma/adapter-pg` + `POSTGRES_URI`. The brief and the
  setup checklist call for `DATABASE_URL` and `npx prisma migrate dev`; the classic
  engine is the lower-risk choice for a "clone and run" reviewer. Can be upgraded later
  without touching call sites.
- **JWT** auth instead of Redis session cookies (brief requirement).
- Redis is used as a read cache for the comments list, not for sessions.
