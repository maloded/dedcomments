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

// ─── Attachments ─────────────────────────────────────────────────────────────
// Mirrors the backend's constants too. The 320×240 resize itself is server-only
// (there's nothing to reject client-side — any image size is accepted and
// resized down), but the file-type/size checks are worth doing client-side to
// avoid a pointless base64 + round trip for a file that's certain to be rejected.

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
] as const;
export const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif"] as const;

/** Text attachments: plain-text only, hard cap 100 KB. */
export const TEXT_FILE_MAX_BYTES = 100 * 1024;
export const ALLOWED_TEXT_EXTENSIONS = [".txt"] as const;

/** Same hard ceiling as the backend's MAX_UPLOAD_BYTES (applies to either kind). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
