import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

// Global: any read-heavy resolver can inject the cache.
@Global()
@Module({
	providers: [CacheService],
	exports: [CacheService],
})
export class CacheModule {}
