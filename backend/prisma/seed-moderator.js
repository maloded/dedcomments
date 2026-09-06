/**
 * Create (or reset the password of) a single moderator account.
 *
 *   npm run seed:moderator
 *
 * Credentials come from MODERATOR_USERNAME / MODERATOR_PASSWORD in backend/.env
 * (dev defaults are in .env.example). Nothing sensitive is committed — the seed
 * reads env at run time.
 *
 * Plain CommonJS, not TypeScript: this needs to run in the production image
 * too (e.g. `docker exec ... node prisma/seed-moderator.js`), which has
 * ts-node pruned as a dev dependency. bcryptjs/@prisma/client/dotenv are all
 * regular dependencies, so `node` alone is enough — no build step needed.
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
	const username = process.env.MODERATOR_USERNAME ?? 'moderator';
	const password = process.env.MODERATOR_PASSWORD;

	if (!password) {
		throw new Error(
			'Set MODERATOR_PASSWORD in backend/.env before seeding a moderator.',
		);
	}

	const prisma = new PrismaClient();
	try {
		const passwordHash = await bcrypt.hash(password, 12);
		const moderator = await prisma.moderator.upsert({
			where: { username },
			create: { username, passwordHash },
			update: { passwordHash },
		});
		console.log(
			`✅ moderator "${moderator.username}" ready (id ${moderator.id})`,
		);
	} finally {
		await prisma.$disconnect();
	}
}

void main().catch((error) => {
	console.error(error);
	process.exit(1);
});
