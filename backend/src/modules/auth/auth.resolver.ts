import { Resolver } from '@nestjs/graphql';
import { AuthService } from './auth.service';

@Resolver()
export class AuthResolver {
	public constructor(private readonly authService: AuthService) {}
}
