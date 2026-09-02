import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 6+ no longer auto-loads .env when a prisma.config.ts is present, so we
// pull it in explicitly above (used by `prisma migrate` on the host).
// The datasource URL itself stays in schema.prisma via env("DATABASE_URL") so that
// `prisma generate` works without the variable being set (e.g. in a Docker build).
export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations',
	},
});
