/**
 * Notification types people can set a delivery preference for. Essential types
 * (security and operational duties) can be moved to a digest but never switched off;
 * the database also ignores "off" for notifications flagged essential.
 */
export type NotificationType = { type: string; label: string; description: string; essential: boolean; management?: boolean };

export const NOTIFICATION_TYPES: NotificationType[] = [
  { type: "security", label: "Account security", description: "Sign-in, password and two-step verification notices.", essential: true },
  { type: "confidential_concern", label: "Confidential concerns", description: "A confidential concern needs your attention.", essential: true, management: true },
  { type: "case_assigned", label: "Support requests assigned to you", description: "A request has been assigned to you.", essential: true, management: true },
  { type: "case_escalated", label: "Escalations", description: "A matter has been escalated to you.", essential: true, management: true },
  { type: "support_request", label: "New support requests", description: "A new request has been raised for a Lodge you look after.", essential: false, management: true },
  { type: "approval", label: "Approvals", description: "Something is waiting for your approval, or a decision was made on your submission.", essential: false, management: true },
  { type: "task_assigned", label: "Tasks assigned to you", description: "Someone gave you a task.", essential: false, management: true },
  { type: "task_due", label: "Task reminders", description: "A task is due or overdue.", essential: false, management: true },
  { type: "mention", label: "Mentions", description: "Someone mentioned you in a note.", essential: false, management: true },
  { type: "allocation", label: "Allocation changes", description: "Lodges allocated to you have changed.", essential: false, management: true },
  { type: "lodge_mentor_change", label: "Lodge Mentor changes", description: "A Lodge Mentor appointment changed.", essential: false, management: true },
  { type: "transfer", label: "Transfers", description: "A member has moved between Lodges.", essential: false, management: true },
  { type: "details_change", label: "Contact detail requests", description: "A member has asked for their details to be updated.", essential: false, management: true },
  { type: "import", label: "Membership imports", description: "A membership import has been committed.", essential: false, management: true },
  { type: "document_ack", label: "Documents to acknowledge", description: "Please read and acknowledge a document.", essential: false },
  { type: "document_review", label: "Document reviews", description: "A document you own is due for review.", essential: false, management: true },
  { type: "event", label: "Events", description: "Changes to events you are booked on, such as a cancellation.", essential: false },
  { type: "learning", label: "Learning", description: "New courses assigned to you.", essential: false },
  { type: "learning_suggestion", label: "Learning suggestions", description: "Suggested courses and next steps.", essential: false },
  { type: "certificate", label: "Certificates", description: "A certificate is ready to download.", essential: false },
];

export const CHANNELS = [
  { value: "in_app", label: "In the Hub only" },
  { value: "email", label: "Email straight away" },
  { value: "daily", label: "Daily summary email" },
  { value: "weekly", label: "Weekly summary email" },
  { value: "off", label: "Off" },
] as const;

export type Channel = (typeof CHANNELS)[number]["value"];

export const isEssentialType = (t: string) => NOTIFICATION_TYPES.some((n) => n.type === t && n.essential);

/** What the background job does when no preference is stored. */
export const DEFAULT_CHANNEL: Channel = "daily";
