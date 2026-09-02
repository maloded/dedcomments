import { Global, Module } from '@nestjs/common';
import { SanitizerService } from './sanitizer.service';

// Global: comments (and the live-preview resolver) both need it.
@Global()
@Module({
	providers: [SanitizerService],
	exports: [SanitizerService],
})
export class SanitizerModule {}
