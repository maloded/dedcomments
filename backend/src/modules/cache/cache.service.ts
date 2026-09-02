import { Injectable } from '@nestjs/common';

@Injectable()
export class CacheService {
	// step 3: thin wrapper over a Redis client (get/set/del + key helpers).
	// Caches the top-level comments list; invalidated on commentCreated.
}
