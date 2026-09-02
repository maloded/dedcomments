import { registerEnumType } from '@nestjs/graphql';

/**
 * Columns the root-comments table can be sorted by (brief §3.2:
 * User Name, E-mail, date added — ascending or descending).
 */
export enum RootCommentSortField {
	USERNAME = 'USERNAME',
	EMAIL = 'EMAIL',
	CREATED_AT = 'CREATED_AT',
}

registerEnumType(RootCommentSortField, {
	name: 'RootCommentSortField',
	description:
		'Sort key for the top-level comments list. Default: CREATED_AT (LIFO).',
});
