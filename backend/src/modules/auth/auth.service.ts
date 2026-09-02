import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class AuthService {
	public constructor(private readonly prismaService: PrismaService) {}

	// step 4: Moderator login (username + passwordHash → JWT), token verification
	// used by the GqlAuthGuard that protects the moderation mutations.
}
