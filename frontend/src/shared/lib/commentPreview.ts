/**
 * A client-side APPROXIMATION of the backend's sanitizer, for the live preview
 * only (CLAUDE.md → comment form step: "doesn't need to call the backend
 * sanitizer, just needs to look like what will be accepted"). The backend is
 * always the real authority — it re-validates and can still reject on submit
 * even if this preview renders something.
 *
 * Strategy: escape the whole string first (so nothing can execute), then
 * selectively un-escape only the exact allowed opening/closing tags
 * (`<a href="" title="">`, `<code>`, `<i>`, `<strong>` — brief §5). Anything
 * else stays escaped/inert text, which is a reasonable stand-in for "the
 * server will reject this" without needing to reproduce its XHTML validator.
 */

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

function escapeHtml(input: string): string {
  return input.replace(/[&<>]/g, (ch) => HTML_ESCAPES[ch]);
}

/** Mirrors the backend sanitizer's href allowlist: only http(s) or a relative path. */
function isSafeHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith("/");
}

const SIMPLE_TAGS = ["code", "i", "strong"] as const;

export function previewCommentHtml(raw: string): string {
  let html = escapeHtml(raw);

  // <a href="..."> or <a href="..." title="...">  — only with a safe scheme.
  html = html.replace(
    /&lt;a href="([^"]*)"(?:\s+title="([^"]*)")?\s*&gt;/g,
    (full, href: string, title: string | undefined) => {
      if (!isSafeHref(href)) {
        return full;
      }
      const titleAttr = title ? ` title="${title}"` : "";
      return `<a href="${href}"${titleAttr}>`;
    },
  );
  html = html.replace(/&lt;\/a&gt;/g, "</a>");

  for (const tag of SIMPLE_TAGS) {
    html = html
      .replaceAll(`&lt;${tag}&gt;`, `<${tag}>`)
      .replaceAll(`&lt;/${tag}&gt;`, `</${tag}>`);
  }

  return html;
}
