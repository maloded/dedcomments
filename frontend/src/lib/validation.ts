/**
 * Mirrors backend/src/shared/constants/validation.constants.ts. The frontend and
 * backend are separate npm projects (no shared workspace — see CLAUDE.md →
 * "Repository structure"), so these are duplicated by hand, not imported. Keep
 * them in sync if the backend's rules ever change; the backend remains the
 * source of truth and re-validates everything server-side regardless.
 */

/** Brief §1: User Name — Latin letters and digits only, required. */
export const USERNAME_REGEX = /^[a-zA-Z0-9]+$/;
export const USERNAME_MAX_LENGTH = 64;

/** Brief §CAPTCHA: digits and Latin letters. */
export const CAPTCHA_REGEX = /^[a-zA-Z0-9]+$/;

export const EMAIL_MAX_LENGTH = 254;

/** Same DoS-guard limit as the backend's COMMENT_TEXT_MAX_LENGTH. */
export const COMMENT_TEXT_MAX_LENGTH = 20_000;

/** The only HTML tags the backend's sanitizer accepts (brief §5). */
export const ALLOWED_HTML_TAGS = ["a", "code", "i", "strong"] as const;
