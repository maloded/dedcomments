/**
 * CAPTCHA generation parameters. The brief requires "digits and Latin letters"
 * — which is exactly `svg-captcha`'s default character set — so we only tune the
 * length and drop a few visually ambiguous glyphs.
 */

/** Number of characters in the challenge. */
export const CAPTCHA_LENGTH = 6;

/** Glyphs removed from the pool because they read ambiguously in the image. */
export const CAPTCHA_IGNORE_CHARS = '0oO1ilIl';

/** Redis key prefix for stored challenge answers. */
export const CAPTCHA_KEY_PREFIX = 'captcha:';
