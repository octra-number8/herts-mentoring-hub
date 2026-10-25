/** Communications vocabulary. */
export const CAMPAIGN_STATUS: Record<string, string> = {
  draft: "Draft", pending_approval: "Awaiting approval", approved: "Approved, sending soon", scheduled: "Scheduled",
  sending: "Sending", sent: "Sent", cancelled: "Cancelled", failed: "Failed",
};
export const CATEGORIES = [
  { value: "news", label: "News and updates", hint: "Only reaches people who have opted in to news." },
  { value: "events", label: "Events", hint: "Respects each person's events preference." },
  { value: "learning", label: "Learning", hint: "Respects each person's learning preference." },
  { value: "operational", label: "Operational", hint: "Essential information about someone's role or membership. Reaches people who unsubscribed from other email, so use sparingly." },
] as const;
export const categoryLabel = (c?: string | null) => CATEGORIES.find((x) => x.value === c)?.label ?? "";
export const RECIPIENT_STATUS: Record<string, string> = {
  queued: "Queued", excluded: "Not sent", sent: "Sent", delivered: "Delivered", bounced: "Bounced", failed: "Failed", complained: "Marked as spam",
};
export const SCOPE_LABEL: Record<string, string> = { province: "Province-wide", allocated: "My allocated Lodges" };
