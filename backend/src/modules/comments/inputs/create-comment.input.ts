import { Field, InputType } from '@nestjs/graphql';
import {
	IsEmail,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUrl,
	IsUUID,
	Matches,
	MaxLength,
} from 'class-validator';
import {
	CAPTCHA_REGEX,
	COMMENT_TEXT_MAX_LENGTH,
	USERNAME_REGEX,
} from '../../../shared/constants';

@InputType()
export class CreateCommentInput {
	@Field(() => String)
	@IsString()
	@Matches(USERNAME_REGEX, {
		message: 'User Name must contain only Latin letters and digits.',
	})
	@MaxLength(64)
	public username: string;

	@Field(() => String)
	@IsEmail({}, { message: 'A valid e-mail address is required.' })
	@MaxLength(254)
	public email: string;

	@Field(() => String, {
		nullable: true,
		description: 'Optional author home page (absolute URL).',
	})
	@IsOptional()
	@IsUrl(
		{ require_protocol: true, protocols: ['http', 'https'] },
		{ message: 'Home page must be a valid http(s) URL.' },
	)
	@MaxLength(2048)
	public homepage?: string;

	@Field(() => String, {
		description:
			'Comment body. Allowed HTML: <a href title>, <code>, <i>, <strong> — ' +
			'must be well-formed XHTML.',
	})
	@IsString()
	@IsNotEmpty({ message: 'Comment text is required.' })
	@MaxLength(COMMENT_TEXT_MAX_LENGTH)
	public text: string;

	@Field(() => String, {
		nullable: true,
		description:
			'Id of the comment being replied to; omit for a root comment.',
	})
	@IsOptional()
	@IsUUID('4', { message: 'parentId must be a valid comment id.' })
	public parentId?: string;

	@Field(() => String, { description: 'Token from `captchaChallenge`.' })
	@IsString()
	@IsNotEmpty({ message: 'captchaToken is required.' })
	public captchaToken: string;

	@Field(() => String, {
		description: 'The text read from the CAPTCHA image.',
	})
	@IsString()
	@IsNotEmpty({ message: 'captchaAnswer is required.' })
	@Matches(CAPTCHA_REGEX, {
		message: 'CAPTCHA answer must be digits and Latin letters.',
	})
	public captchaAnswer: string;

	@Field(() => String, {
		nullable: true,
		description: 'Id of a previously uploaded, not-yet-linked attachment.',
	})
	@IsOptional()
	@IsUUID('4', { message: 'attachmentId must be a valid attachment id.' })
	public attachmentId?: string;
}
