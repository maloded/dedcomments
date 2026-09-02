import { registerEnumType } from '@nestjs/graphql';

/**
 * Sort direction. Values match Prisma's `orderBy` literals so they can be passed
 * straight through. `DESC` is the default everywhere (brief §5: LIFO — newest
 * first).
 */
export enum SortOrder {
	ASC = 'asc',
	DESC = 'desc',
}

registerEnumType(SortOrder, {
	name: 'SortOrder',
	description: 'Sort direction; DESC (newest first / LIFO) is the default.',
});
