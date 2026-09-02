/**
 * Rate limits (via `@nestjs/throttler`, keyed by client IP, in-memory store).
 * `ttl` is in **milliseconds**.
 *
 * Numbers chosen for a public, unauthenticated comment box:
 *  - global: a generous ceiling that only trips obvious floods
 *  - createComment: a human posts a handful per minute at most
 *  - moderatorLogin: tight, to blunt password brute-forcing
 */
export const GLOBAL_RATE_LIMIT = { ttl: 60_000, limit: 120 };
export const CREATE_COMMENT_RATE_LIMIT = { ttl: 60_000, limit: 10 };
export const LOGIN_RATE_LIMIT = { ttl: 60_000, limit: 5 };
