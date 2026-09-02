// Load backend/.env before the Nest app boots so the e2e run has the same
// configuration as `npm run start:dev` (jest does not read .env on its own).
import { config } from 'dotenv';
import { join } from 'node:path';

config({ path: join(__dirname, '..', '.env'), quiet: true });
