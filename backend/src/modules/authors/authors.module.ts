import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorsService } from './authors.service';
import { AuthorsResolver } from './authors.resolver';

@Module({
	imports: [AuthModule],
	providers: [AuthorsResolver, AuthorsService],
	exports: [AuthorsService],
})
export class AuthorsModule {}
