import { Module } from '@nestjs/common';
import { AuthorsService } from './authors.service';
import { AuthorsResolver } from './authors.resolver';

@Module({
	providers: [AuthorsResolver, AuthorsService],
	exports: [AuthorsService],
})
export class AuthorsModule {}
