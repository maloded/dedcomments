import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

@InputType()
export class ModeratorLoginInput {
	@Field(() => String)
	@IsString()
	@IsNotEmpty()
	@MaxLength(64)
	public username: string;

	@Field(() => String)
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	public password: string;
}
