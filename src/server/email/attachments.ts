type Attachment = { path: string; bucket: string; filename: string };

/**
 * Attachments are later downloaded with the service role, so only the places
 * the Hub itself writes them are accepted: a campaign's own folder in
 * comms-attachments, and scheduled report files. Anything else (a path edited
 * into a draft campaign, say) is refused rather than emailed out.
 */
export function attachmentAllowed(orgId: string, a: Attachment, campaignId?: string | null): boolean {
  if (!a || typeof a.path !== "string" || typeof a.bucket !== "string" || a.path.includes("..") || a.path.startsWith("/")) return false;
  if (a.bucket === "comms-attachments") return !!campaignId && a.path.startsWith(`${orgId}/comms/${campaignId}/`);
  if (a.bucket === "documents") return !campaignId && a.path.startsWith(`${orgId}/reports/`);
  return false;
}
