import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthResolver } from './auth.resolver';

// step 4 will register JwtModule.registerAsync here and provide the GqlAuthGuard.
@Module({
	providers: [AuthResolver, AuthService],
	exports: [AuthService],
})
export class AuthModule {}
