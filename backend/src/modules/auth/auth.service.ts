import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Moderator } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../../core/prisma/prisma.service';
import { MODERATOR_ROLE, type ModeratorJwtPayload } from './auth.constants';
import type { ModeratorLoginInput } from './inputs/moderator-login.input';
import type { AuthPayload } from './models/auth-payload.model';

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);

	public constructor(
		private readonly prismaService: PrismaService,
		private readonly jwtService: JwtService,
	) {}

	/**
	 * Verify a moderator's credentials (bcrypt) and issue a JWT. The same
	 * "invalid credentials" error is returned whether the username or the
	 * password was wrong, so it can't be used to enumerate accounts.
	 */
	public async moderatorLogin(
		input: ModeratorLoginInput,
	): Promise<AuthPayload> {
		const moderator = await this.prismaService.moderator.findUnique({
			where: { username: input.username },
		});

		const passwordOk =
			moderator !== null &&
			(await bcrypt.compare(input.password, moderator.passwordHash));

		if (!moderator || !passwordOk) {
			this.logger.warn(`failed moderator login for "${input.username}"`);
			throw new UnauthorizedException('Invalid username or password.');
		}

		const payload: ModeratorJwtPayload = {
			sub: moderator.id,
			username: moderator.username,
			role: MODERATOR_ROLE,
		};

		return {
			accessToken: await this.jwtService.signAsync(payload),
			moderator,
		};
	}

	/**
	 * Verify a bearer token and load the moderator it belongs to. Used by
	 * `JwtAuthGuard`. Throws `UnauthorizedException` on any problem.
	 */
	public async verifyModerator(token: string): Promise<Moderator> {
		let payload: ModeratorJwtPayload;
		try {
			payload =
				await this.jwtService.verifyAsync<ModeratorJwtPayload>(token);
		} catch {
			throw new UnauthorizedException('Invalid or expired token.');
		}

		if (payload.role !== MODERATOR_ROLE) {
			throw new UnauthorizedException('Not a moderator token.');
		}

		const moderator = await this.prismaService.moderator.findUnique({
			where: { id: payload.sub },
		});
		if (!moderator) {
			throw new UnauthorizedException('Account no longer exists.');
		}
		return moderator;
	}
}
