import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class CaptchaService {
	public constructor(private readonly prismaService: PrismaService) {}

	// step 2: generate a CaptchaChallenge (+ image), verify the answer on submit,
	// then consume (invalidate) the challenge so it can't be replayed.
}
