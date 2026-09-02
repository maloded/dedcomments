import { ArgsType, Field, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { DEFAULT_PAGE } from '../constants/pagination.constants';
import { SortOrder } from '../enums/sort-order.enum';

/**
 * Base arguments for any paginated + sorted list query. Feature resolvers extend
 * this to add a `sortBy` field with their own allowed columns, e.g.:
 *
 *   @ArgsType()
 *   export class RootCommentsArgs extends PaginationArgs {
 *     @Field(() => CommentSortField, { defaultValue: CommentSortField.CREATED_AT })
 *     sortBy: CommentSortField;
 *   }
 *
 * Page size is fixed by the brief (25 for root comments), so it is not exposed
 * here — see `ROOT_COMMENTS_PER_PAGE`.
 */
@ArgsType()
export class PaginationArgs {
	@Field(() => Int, {
		defaultValue: DEFAULT_PAGE,
		description: '1-based page number.',
	})
	@IsInt()
	@Min(1)
	@IsOptional()
	page: number = DEFAULT_PAGE;

	@Field(() => SortOrder, {
		defaultValue: SortOrder.DESC,
		description: 'Sort direction. Defaults to DESC (LIFO — newest first).',
	})
	@IsEnum(SortOrder)
	@IsOptional()
	sortOrder: SortOrder = SortOrder.DESC;
}
