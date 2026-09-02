import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class AttachmentsService {
	public constructor(private readonly prismaService: PrismaService) {}

	// step 3: accept upload, enqueue image resize / text-file validation on RabbitMQ,
	// persist the Attachment row, mark processedAt when the worker finishes.
}
