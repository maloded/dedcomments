import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class CommentsService {
	public constructor(private readonly prismaService: PrismaService) {}

	// Business logic lands here in step 2: rootComments (pagination + sorting),
	// commentThread (recursive CTE), createComment (validation + captcha + sanitize).
}
