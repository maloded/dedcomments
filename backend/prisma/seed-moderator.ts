/**
 * Create (or reset the password of) a single moderator account.
 *
 *   npm run seed:moderator
 *
 * Credentials come from MODERATOR_USERNAME / MODERATOR_PASSWORD in backend/.env
 * (dev defaults are in .env.example). Nothing sensitive is committed — the seed
 * reads env at run time.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

async function main(): Promise<void> {
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
		// eslint-disable-next-line no-console
		console.log(
			`✅ moderator "${moderator.username}" ready (id ${moderator.id})`,
		);
	} finally {
		await prisma.$disconnect();
	}
}

void main().catch((error: unknown) => {
	// eslint-disable-next-line no-console
	console.error(error);
	process.exit(1);
});
