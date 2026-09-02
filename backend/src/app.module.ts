import { Module } from '@nestjs/common';

import { CoreModule } from './core/core.module';

import { AuthModule } from './modules/auth/auth.module';
import { AuthorsModule } from './modules/authors/authors.module';
import { CommentsModule } from './modules/comments/comments.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { CaptchaModule } from './modules/captcha/captcha.module';
import { SanitizerModule } from './modules/sanitizer/sanitizer.module';
import { CacheModule } from './modules/cache/cache.module';
import { GatewayModule } from './modules/gateway/gateway.module';

@Module({
	imports: [
		CoreModule,

		// infra-ish features
		CacheModule,
		SanitizerModule,

		// domain features
		AuthModule,
		AuthorsModule,
		CommentsModule,
		AttachmentsModule,
		CaptchaModule,
		GatewayModule,
	],
})
export class AppModule {}
