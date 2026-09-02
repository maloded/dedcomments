/**
 * Single source of truth for the brief's validation / sanitization rules.
 * Consumed by the comment input DTOs, the sanitizer module and the attachments
 * module so the numbers and patterns are never redefined in three places.
 */

/** Brief §1: User Name — Latin letters and digits only, required. */
export const USERNAME_REGEX = /^[a-zA-Z0-9]+$/;

/** Brief §4/§CAPTCHA: digits and Latin letters. */
export const CAPTCHA_REGEX = /^[a-zA-Z0-9]+$/;

/** Brief §5: the ONLY HTML tags allowed in comment text. */
export const ALLOWED_HTML_TAGS = ['a', 'code', 'i', 'strong'] as const;

/** Allowed attributes per tag; everything else is stripped. */
export const ALLOWED_HTML_ATTRIBUTES: Readonly<
	Record<string, readonly string[]>
> = {
	a: ['href', 'title'],
};

// ─── Attachments (brief "File handling") ─────────────────────────────────────

/** Images larger than this are proportionally resized down. */
export const IMAGE_MAX_WIDTH = 320;
export const IMAGE_MAX_HEIGHT = 240;
export const ALLOWED_IMAGE_MIME_TYPES = [
	'image/jpeg',
	'image/png',
	'image/gif',
] as const;

/** Text attachments: plain-text only, hard cap 100 KB. */
export const TEXT_FILE_MAX_BYTES = 100 * 1024;
export const ALLOWED_TEXT_MIME_TYPES = ['text/plain'] as const;
