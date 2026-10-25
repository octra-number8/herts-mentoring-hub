import { cn } from "@/lib/utils";

export type Tone = "neutral" | "navy" | "teal" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-canvas text-slate-ink ring-line",
  navy: "bg-navy-50 text-navy-800 ring-navy-100",
  teal: "bg-teal-50 text-teal-800 ring-teal-100",
  success: "bg-success-50 text-success-700 ring-success-700/20",
  warning: "bg-warning-50 text-warning-800 ring-warning-800/20",
  danger: "bg-danger-50 text-danger-700 ring-danger-700/20",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-[13px] font-medium ring-1 ring-inset whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

const STATUS_TONES: Record<string, Tone> = {
  open: "navy", in_progress: "teal", waiting: "warning", done: "success", cancelled: "neutral",
  new: "navy", triage: "warning", assigned: "navy", awaiting_response: "warning", escalated: "danger", resolved: "success", closed: "neutral", referred: "neutral",
  draft: "neutral", review: "warning", approved: "teal", published: "success", revised: "neutral", archived: "neutral", superseded: "neutral",
  pending_approval: "warning", scheduled: "teal", sending: "teal", sent: "success", failed: "danger",
  planned: "navy", completed: "success", postponed: "warning",
  confirmed: "success", waitlisted: "warning", attended: "success", no_show: "neutral",
  enrolled: "navy", withdrawn: "neutral",
  active: "success", invited: "navy", suspended: "warning", deactivated: "neutral",
  uploaded: "neutral", validated: "teal", committing: "teal", committed: "success",
  succeeded: "success", skipped: "neutral", running: "teal", pending: "neutral",
  high: "danger", normal: "neutral", low: "neutral",
};
export const statusTone = (s?: string | null): Tone => (s ? STATUS_TONES[s] ?? "neutral" : "neutral");
