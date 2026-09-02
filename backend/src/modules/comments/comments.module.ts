import { Module } from '@nestjs/common';
import { AuthorsModule } from '../authors/authors.module';
import { CaptchaModule } from '../captcha/captcha.module';
import { CommentsService } from './comments.service';
import { CommentsResolver } from './comments.resolver';

@Module({
	imports: [AuthorsModule, CaptchaModule],
	providers: [CommentsResolver, CommentsService],
	exports: [CommentsService],
})
export class CommentsModule {}
