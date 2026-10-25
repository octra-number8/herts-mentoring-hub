import "server-only";
import { renderMarkdown, stripMarkdown } from "@/lib/markdown";
import { serverEnv } from "@/lib/env";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Branded, accessible email layout. Table-based for mail-client compatibility.
 * Non-essential categories carry an unsubscribe link; essential ones do not.
 */
export function renderEmail(opts: {
  orgName: string; subject: string; markdown: string; preheader?: string | null; unsubscribeUrl?: string | null; footerNote?: string;
}): { html: string; text: string } {
  const appUrl = serverEnv().appUrl;
  const body = renderMarkdown(opts.markdown)
    .replace(/<a /g, '<a style="color:#0a4f72;text-decoration:underline;" ')
    .replace(/<p>/g, '<p style="margin:0 0 14px;">')
    .replace(/<h2>/g, '<h2 style="font-size:19px;color:#003668;margin:22px 0 10px;">');
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f8fb;font-family:'DM Sans',Arial,Helvetica,sans-serif;color:#1d2733;">
${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${esc(opts.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8fb;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #dbe3ec;border-radius:8px;">
<tr><td style="background:#003668;border-radius:8px 8px 0 0;padding:18px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:12px;"><img src="${appUrl}/brand/shield-256.png" width="30" height="35" alt="" style="display:block;"></td>
<td style="color:#ffffff;font-size:16px;font-weight:600;">${esc(opts.orgName)}<br><span style="font-size:12px;font-weight:400;color:#bfd6ea;">Mentoring · Prepare · Guide · Support · Enlighten</span></td>
</tr></table></td></tr>
<tr><td style="padding:28px;font-size:16px;line-height:1.6;">${body}</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #dbe3ec;font-size:12px;line-height:1.5;color:#5d6b7a;">
${opts.footerNote ? `${esc(opts.footerNote)}<br>` : ""}Provincial Office, Fleet House, 10 Parkway, St Albans AL3 6PA · mentor@hertfordshirefreemasons.org.uk
${opts.unsubscribeUrl ? `<br><a href="${opts.unsubscribeUrl}" style="color:#5d6b7a;">Unsubscribe or change email preferences</a>` : ""}
</td></tr></table></td></tr></table></body></html>`;
  const text = `${stripMarkdown(opts.markdown)}\n\n--\n${opts.orgName}\nProvincial Office, Fleet House, 10 Parkway, St Albans AL3 6PA${opts.unsubscribeUrl ? `\nUnsubscribe: ${opts.unsubscribeUrl}` : ""}`;
  return { html, text };
}
