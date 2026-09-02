// Load backend/.env before the Nest app boots so the e2e run has the same
// configuration as `npm run start:dev` (jest does not read .env on its own).
import { config } from 'dotenv';
import { join } from 'node:path';

config({ path: join(__dirname, '..', '.env'), quiet: true });

// e2e specs create many comments per second; the rate limiter would fail them.
// The limits are verified by unit tests and manual QA instead.
process.env.THROTTLE_DISABLED = 'true';
