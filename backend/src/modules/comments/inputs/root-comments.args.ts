import { ArgsType, Field } from '@nestjs/graphql';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationArgs } from '../../../shared/dto/pagination.args';
import { RootCommentSortField } from '../enums/root-comment-sort-field.enum';

/**
 * Args for `rootComments`. Inherits `page` + `sortOrder` from `PaginationArgs`
 * and adds the comment-specific `sortBy`. Defaults give the brief's LIFO view:
 * newest top-level comments first (`sortBy: CREATED_AT`, `sortOrder: DESC`).
 */
@ArgsType()
export class RootCommentsArgs extends PaginationArgs {
	@Field(() => RootCommentSortField, {
		defaultValue: RootCommentSortField.CREATED_AT,
		description: 'Column to sort by. Default: CREATED_AT.',
	})
	@IsEnum(RootCommentSortField)
	@IsOptional()
	sortBy: RootCommentSortField = RootCommentSortField.CREATED_AT;
}
