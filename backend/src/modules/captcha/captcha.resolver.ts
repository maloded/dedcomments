import { Resolver } from '@nestjs/graphql';
import { CaptchaService } from './captcha.service';

@Resolver()
export class CaptchaResolver {
	public constructor(private readonly captchaService: CaptchaService) {}
}
