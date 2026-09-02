import { Resolver } from '@nestjs/graphql';
import { AuthorsService } from './authors.service';

@Resolver()
export class AuthorsResolver {
	public constructor(private readonly authorsService: AuthorsService) {}
}
