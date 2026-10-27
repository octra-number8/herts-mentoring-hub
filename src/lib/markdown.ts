import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.setOptions({ gfm: true, breaks: false });

const ALLOWED = {
  allowedTags: ["h2", "h3", "h4", "p", "ul", "ol", "li", "strong", "em", "a", "blockquote", "br", "hr", "code", "pre", "table", "thead", "tbody", "tr", "th", "td", "img", "span"],
  allowedAttributes: { a: ["href", "title", "target", "rel"], img: ["src", "alt", "width", "height"], span: ["class"] },
  allowedSchemes: ["https", "http", "mailto", "tel"],
  transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }) },
};

/** Markdown to sanitised HTML. Safe for content written by authorised users. */
export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return "";
  // Tables get a scrolling wrapper so a wide one never pushes the page sideways on a phone.
  return sanitizeHtml(marked.parse(md, { async: false }) as string, ALLOWED)
    .replace(/<table>/g, '<div class="prose-table"><table>').replace(/<\/table>/g, "</table></div>");
}

/** Plain-text version of Markdown. Links keep their address, e.g. "Accept (https://...)". */
export function stripMarkdown(md: string): string {
  const withUrls = md.replace(/\[([^\]]+)\]\((\S+?)\)/g, (_, text: string, url: string) => (text === url ? url : `${text} (${url})`));
  return sanitizeHtml(marked.parse(withUrls, { async: false }) as string, { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Escape text from records (names, titles, messages) before it is placed in
 * Markdown, so it cannot add links or formatting to a genuine Hub email
 * (":" and "." too, which stops bare addresses being auto-linked).
 */
export const escapeMarkdown = (s: string) => s.replace(/[\\`*_[\]()#+!<>|~:.]/g, (c) => `\\${c}`);

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Replace {{name}} placeholders. Values are escaped for Markdown/HTML safety. */
export function interpolate(template: string, vars: Record<string, string | number | null | undefined>, opts: { escape?: boolean } = { escape: true }): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => {
    const v = vars[k];
    if (v === null || v === undefined) return "";
    return opts.escape === false ? String(v) : escapeHtml(String(v));
  });
}
