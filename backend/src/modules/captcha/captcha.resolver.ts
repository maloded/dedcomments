import { Query, Resolver } from '@nestjs/graphql';
import { CaptchaService } from './captcha.service';
import { CaptchaChallengeModel } from './models/captcha-challenge.model';

@Resolver(() => CaptchaChallengeModel)
export class CaptchaResolver {
	public constructor(private readonly captchaService: CaptchaService) {}

	@Query(() => CaptchaChallengeModel, {
		name: 'captchaChallenge',
		description:
			'Generate a fresh CAPTCHA (token + SVG image). Solve it and pass ' +
			'`token` + answer to `createComment`.',
	})
	public captchaChallenge(): Promise<CaptchaChallengeModel> {
		return this.captchaService.generateChallenge();
	}
}
