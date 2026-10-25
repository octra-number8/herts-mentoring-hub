/** Meeting kinds and their labels (safe to import from server and client code). */
export const MEETING_KIND_LABELS: Record<string, string> = {
  team: "Provincial team", apgmen: "Assistants", leadership: "Leadership", working_group: "Working group", other: "Other",
};
export const meetingKindLabel = (k?: string | null) => (k ? MEETING_KIND_LABELS[k] ?? k : "");
export const ATTENDANCE_LABELS: Record<string, string> = { invited: "Invited", attended: "Attended", apologies: "Apologies", absent: "Absent" };
