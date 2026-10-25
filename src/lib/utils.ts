import { clsx, type ClassValue } from "clsx";

export const cn = (...v: ClassValue[]) => clsx(v);

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const DATE_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });

export const formatDate = (d?: string | Date | null) => (d ? DATE.format(new Date(d)) : "");
export const formatDateTime = (d?: string | Date | null) => (d ? DATE_TIME.format(new Date(d)) : "");
export const formatTime = (d?: string | Date | null) => (d ? TIME.format(new Date(d)) : "");
export const formatDay = (d?: string | Date | null) => (d ? WEEKDAY.format(new Date(d)) : "");

export function relativeDays(d?: string | Date | null): string {
  if (!d) return "";
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function monthsBetween(a: string | Date, b: string | Date = new Date()): number {
  const x = new Date(a), y = new Date(b);
  return (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth()) - (y.getDate() < x.getDate() ? 1 : 0);
}

export const initials = (name: string) =>
  name.replace(/^(W Bro|VW Bro|RW Bro|Bro|Comp|E Comp)\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** Human labels for stored keys. */
export const LABELS: Record<string, string> = {
  worshipful_master: "Worshipful Master", secretary: "Secretary", lodge_mentor: "Lodge Mentor",
  assistant_lodge_mentor: "Assistant Lodge Mentor", membership_officer: "Membership Officer", almoner: "Almoner",
  director_of_ceremonies: "Director of Ceremonies", royal_arch_representative: "Royal Arch Representative", charity_steward: "Charity Steward",
  enquirer: "Enquirer", applicant: "Applicant", candidate: "Candidate", entered_apprentice: "Entered Apprentice",
  fellow_craft: "Fellow Craft", master_mason: "Master Mason", established: "Established member",
  telephone: "Telephone", email: "Email", online_meeting: "Online meeting", face_to_face: "Face to face", lodge_visit: "Lodge visit", other: "Other",
  open: "Open", in_progress: "In progress", waiting: "Waiting", done: "Done", cancelled: "Cancelled",
  new: "New", triage: "Triage", assigned: "Assigned", awaiting_response: "Awaiting response", escalated: "Escalated",
  resolved: "Resolved", closed: "Closed", referred: "Referred",
  low: "Low", normal: "Normal", high: "High",
  yes: "Yes", no: "No", unknown: "Unknown", partly: "Partly",
  draft: "Draft", review: "In review", approved: "Approved", published: "Published", revised: "Revised", archived: "Archived", superseded: "Superseded",
  ordinary: "Ordinary", team: "Provincial team", leadership: "Leadership only", restricted: "Restricted",
  planned: "Planned", completed: "Completed", postponed: "Postponed",
  confirmed: "Confirmed", waitlisted: "Waiting list", attended: "Attended", no_show: "Did not attend",
  not_discussed: "Not yet discussed", informed: "Informed", interested: "Interested", proposed: "Proposed", exalted: "Exalted", not_now: "Not at present",
  learning: "Academy learners", mentors: "Mentors", internal: "Provincial team",
  prepare: "Prepare", guide: "Guide", support: "Support", enlighten: "Enlighten",
  essential: "Essential", recommended: "Recommended", optional: "Optional",
};
export const label = (k?: string | null) => (k ? LABELS[k] ?? k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "");
