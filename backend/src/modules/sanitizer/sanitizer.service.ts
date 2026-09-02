import { BadRequestException, Injectable } from '@nestjs/common';
import { Parser } from 'htmlparser2';
import sanitizeHtml from 'sanitize-html';

import {
	ALLOWED_HTML_ATTRIBUTES,
	ALLOWED_HTML_TAGS,
} from '../../shared/constants';

const ALLOWED_TAG_SET = new Set<string>(ALLOWED_HTML_TAGS);
const SAFE_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:']);
const EXPLICIT_CLOSE_TAG = /<\/[a-zA-Z][^>]*>/g;

/**
 * Comment-body sanitizer — the primary XSS defence.
 *
 * Policy (see docs/code-style-reference.md → "Sanitizer"):
 *  - Only `<a href title>`, `<code>`, `<i>`, `<strong>` are permitted. Any other
 *    tag or attribute is **rejected with a clear error**, not silently stripped —
 *    the author should know their markup was wrong.
 *  - Markup must be well-formed / valid XHTML: every tag is explicitly opened
 *    **and** explicitly closed, correctly nested. Unclosed tags, mis-nested tags
 *    and stray end tags are **rejected**, never auto-closed.
 *  - `<a href>` must use a safe scheme (http/https/mailto), be empty, or be a
 *    fragment/relative link.
 *  - Text-level entities are normalised toward valid XHTML (`&` → `&amp;`); that
 *    is normalisation, not structural auto-fixing.
 */
@Injectable()
export class SanitizerService {
	public sanitize(rawText: string): string {
		const text = rawText ?? '';

		this.assertAllowedAndWellFormed(text);

		return sanitizeHtml(text, {
			allowedTags: [...ALLOWED_HTML_TAGS],
			allowedAttributes: { a: ['href', 'title'] },
			allowedSchemes: ['http', 'https', 'mailto'],
			disallowedTagsMode: 'discard',
		}).trim();
	}

	private assertAllowedAndWellFormed(html: string): void {
		const stack: string[] = [];
		let violation: string | null = null;
		let explicitCloses = 0;

		const fail = (message: string): void => {
			violation ??= message;
		};

		const parser = new Parser(
			{
				onopentag: (name, attribs) => {
					if (violation) {
						return;
					}
					if (!ALLOWED_TAG_SET.has(name)) {
						fail(
							`The <${name}> tag is not allowed. Allowed tags: ${ALLOWED_HTML_TAGS.join(
								', ',
							)}.`,
						);
						return;
					}
					const allowedAttrs: readonly string[] =
						ALLOWED_HTML_ATTRIBUTES[name] ?? [];
					for (const attr of Object.keys(attribs)) {
						if (!allowedAttrs.includes(attr)) {
							fail(
								`Attribute "${attr}" is not allowed on <${name}>.`,
							);
							return;
						}
					}
					if (
						name === 'a' &&
						attribs.href !== undefined &&
						!SanitizerService.isSafeHref(attribs.href)
					) {
						fail(
							`Unsafe or unsupported link URL: "${attribs.href}".`,
						);
						return;
					}
					stack.push(name);
				},
				onclosetag: (name, isImplied) => {
					if (violation) {
						return;
					}
					if (isImplied) {
						// htmlparser2 auto-closes at EOF / on a mis-nested tag —
						// which means the author did not close it themselves.
						fail(
							`Malformed markup: <${name}> is not properly closed. ` +
								`Tags must be explicitly closed and correctly nested (valid XHTML).`,
						);
						return;
					}
					explicitCloses += 1;
					if (stack.length === 0) {
						fail(
							`Unexpected closing tag </${name}> — nothing is open here.`,
						);
						return;
					}
					const open = stack.pop();
					if (open !== name) {
						fail(
							`Malformed markup: <${open}> is closed by </${name}>. ` +
								`Tags must be properly nested and closed (valid XHTML).`,
						);
					}
				},
				onerror: error => fail(`Malformed markup: ${error.message}`),
			},
			{ xmlMode: true, recognizeSelfClosing: true, lowerCaseTags: true },
		);

		parser.write(html);
		parser.end();

		if (!violation && stack.length > 0) {
			fail(
				`Malformed markup: <${stack[stack.length - 1]}> is never closed. ` +
					`Tags must be properly closed (valid XHTML).`,
			);
		}

		// A stray end tag with nothing open is dropped by the parser without a
		// callback — catch it by comparing source `</x>` count to what we saw.
		if (!violation) {
			const inSource = (html.match(EXPLICIT_CLOSE_TAG) ?? []).length;
			if (explicitCloses < inSource) {
				fail(
					'Unexpected closing tag — every </tag> needs a matching opening tag.',
				);
			}
		}

		if (violation) {
			throw new BadRequestException(violation);
		}
	}

	private static isSafeHref(href: string): boolean {
		const value = href.trim();
		if (value === '' || value.startsWith('/') || value.startsWith('#')) {
			return true;
		}
		try {
			return SAFE_URL_SCHEMES.has(new URL(value).protocol);
		} catch {
			return false;
		}
	}
}
