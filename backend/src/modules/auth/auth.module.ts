import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';

import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { AuthResolver } from './auth.resolver';

@Module({
	imports: [
		JwtModule.registerAsync({
			global: true,
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService): JwtModuleOptions => ({
				secret: config.getOrThrow<string>('JWT_SECRET'),
				// `expiresIn` is a plain string like "1d" — the ms-based type is
				// stricter than what jsonwebtoken actually accepts.
				signOptions: {
					expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '1d',
				} as JwtModuleOptions['signOptions'],
			}),
		}),
	],
	providers: [AuthResolver, AuthService, JwtAuthGuard],
	exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
