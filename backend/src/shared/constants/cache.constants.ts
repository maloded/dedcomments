/**
 * Redis key namespace + TTL for the cached top-level comments list.
 * Short TTL: new comments should show up quickly, and the list is busted
 * explicitly on every `createComment` anyway (belt and braces).
 */
export const ROOT_COMMENTS_CACHE_PREFIX = 'rootComments:';
export const ROOT_COMMENTS_CACHE_TTL_SECONDS = 45;
