/** Event vocabulary shared by management, Academy, calendar and public pages. */

export const EVENT_KINDS = [
  { value: "workshop", label: "Workshop", training: true },
  { value: "online_training", label: "Online training", training: true },
  { value: "training_day", label: "Training day", training: true },
  { value: "mentoring_evening", label: "Mentoring evening", training: true },
  { value: "presentation", label: "Presentation", training: true },
  { value: "prov_meeting", label: "Provincial mentoring meeting", training: false },
  { value: "apgmen_meeting", label: "APGMen meeting", training: false },
  { value: "lodge_visit", label: "Lodge visit", training: false },
  { value: "new_mason_evening", label: "New Mason Evening", training: false },
  { value: "narrated_ceremony", label: "Narrated ceremony", training: false },
  { value: "mentoring_lodge", label: "Mentoring Lodge meeting", training: false },
  { value: "discover_freemasonry", label: "Discover Freemasonry", training: false },
  { value: "provincial_activity", label: "Related Provincial activity", training: false },
  { value: "other", label: "Other", training: false },
] as const;

export type EventKind = (typeof EVENT_KINDS)[number]["value"];

export const EVENT_VISIBILITY = [
  { value: "internal", label: "Provincial team only", hint: "People with access to internal events." },
  { value: "lodge_mentors", label: "Lodge Mentors", hint: "Current Lodge Mentors and Assistant Lodge Mentors, plus the Provincial team." },
  { value: "invited", label: "Invited members", hint: "Only the people you invite, plus the Provincial team." },
  { value: "learners", label: "Academy learners", hint: "Everyone with Academy access." },
  { value: "public", label: "Public", hint: "Listed on the public What's On page. Registration still needs a Hub account." },
] as const;

export const EVENT_FORMATS = [
  { value: "in_person", label: "In person" },
  { value: "online", label: "Online" },
  { value: "hybrid", label: "Hybrid (in person and online)" },
] as const;

export const REGISTRATION_MODES = [
  { value: "hub", label: "Register in the Hub" },
  { value: "external", label: "Book through Octra-Lodge (paid or externally managed)" },
  { value: "none", label: "No registration needed" },
] as const;

export const EVENT_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const TRAINER_ROLES = [
  { value: "trainer", label: "Trainer" },
  { value: "presenter", label: "Presenter" },
  { value: "host", label: "Host" },
  { value: "support", label: "Support" },
] as const;

const find = (list: readonly { value: string; label: string }[], v?: string | null) => list.find((x) => x.value === v)?.label ?? "";

export const kindLabel = (k?: string | null) => find(EVENT_KINDS, k) || "Event";
export const visibilityLabel = (v?: string | null) => find(EVENT_VISIBILITY, v);
export const formatLabel = (v?: string | null) => find(EVENT_FORMATS, v);
export const eventStatusLabel = (v?: string | null) => find(EVENT_STATUSES, v);
export const trainerRoleLabel = (v?: string | null) => find(TRAINER_ROLES, v);

export const REGISTRATION_LABELS: Record<string, string> = {
  confirmed: "Confirmed", waitlisted: "Waiting list", cancelled: "Cancelled", attended: "Attended", no_show: "Did not attend",
};
export const registrationLabel = (s?: string | null) => (s ? REGISTRATION_LABELS[s] ?? s : "");

export const CHECKIN_METHOD_LABELS: Record<string, string> = { qr_session: "Session QR code", qr_personal: "Personal QR code", manual: "Recorded by organiser" };
