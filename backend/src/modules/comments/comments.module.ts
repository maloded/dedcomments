import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorsModule } from '../authors/authors.module';
import { CaptchaModule } from '../captcha/captcha.module';
import { GatewayModule } from '../gateway/gateway.module';
import { CommentsService } from './comments.service';
import { CommentsResolver } from './comments.resolver';

@Module({
	imports: [AuthModule, AuthorsModule, CaptchaModule, GatewayModule],
	providers: [CommentsResolver, CommentsService],
	exports: [CommentsService],
})
export class CommentsModule {}
