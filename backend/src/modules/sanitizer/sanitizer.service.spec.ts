import { BadRequestException } from '@nestjs/common';
import { SanitizerService } from './sanitizer.service';

describe('SanitizerService', () => {
	const sanitizer = new SanitizerService();

	describe('allowed markup passes through', () => {
		it.each([
			'plain text with no markup',
			'<strong>bold</strong>',
			'<i>italic</i> and <code>code()</code>',
			'<a href="https://example.com" title="t">link</a>',
			'<a href="mailto:x@y.com">mail</a>',
			'<a href="/relative" title="">rel</a>',
			'nested <strong>b <i>i <code>c</code></i></strong> ok',
		])('%s', input => {
			expect(() => sanitizer.sanitize(input)).not.toThrow();
		});

		it('keeps the allowed tags in the output', () => {
			const out = sanitizer.sanitize(
				'<strong>b</strong> <i>i</i> <code>c</code>',
			);
			expect(out).toBe('<strong>b</strong> <i>i</i> <code>c</code>');
		});

		it('normalises a bare ampersand to a valid XHTML entity', () => {
			expect(sanitizer.sanitize('Tom & Jerry')).toBe('Tom &amp; Jerry');
		});
	});

	describe('disallowed tags / attributes are rejected', () => {
		it.each([
			['<script>alert(1)</script>', /<script> tag is not allowed/],
			['<img src="x" onerror="alert(1)" />', /<img> tag is not allowed/],
			['<div>hi</div>', /<div> tag is not allowed/],
			[
				'<a href="https://x.com" onclick="evil()">x</a>',
				/Attribute "onclick" is not allowed/,
			],
			[
				'<strong class="x">b</strong>',
				/Attribute "class" is not allowed/,
			],
			[
				'<a href="javascript:alert(1)">x</a>',
				/Unsafe or unsupported link URL/,
			],
		])('%s', (input, message) => {
			expect(() => sanitizer.sanitize(input)).toThrow(
				BadRequestException,
			);
			expect(() => sanitizer.sanitize(input)).toThrow(message);
		});
	});

	describe('malformed markup is rejected (not auto-fixed)', () => {
		it.each([
			['<strong>unclosed', /not properly closed|never closed/],
			['<i>a</strong>', /Malformed markup/],
			['<strong><i>x</strong></i>', /Malformed markup/],
			['hello</strong>', /Unexpected closing tag/],
			['<code>a<code>b', /not properly closed|never closed/],
		])('%s', (input, message) => {
			expect(() => sanitizer.sanitize(input)).toThrow(
				BadRequestException,
			);
			expect(() => sanitizer.sanitize(input)).toThrow(message);
		});
	});
});
