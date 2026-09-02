import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class AuthorsService {
	public constructor(private readonly prismaService: PrismaService) {}

	// find-or-create an Author by (username, email) at comment-submission time.
}
