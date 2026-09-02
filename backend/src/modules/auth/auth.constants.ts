/** Role carried in the moderator JWT. Only one role exists in this system. */
export const MODERATOR_ROLE = 'MODERATOR';

/** Shape of the signed JWT payload. */
export interface ModeratorJwtPayload {
	sub: string;
	username: string;
	role: typeof MODERATOR_ROLE;
}
