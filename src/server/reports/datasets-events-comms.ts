import "server-only";
import { kindLabel, registrationLabel, CHECKIN_METHOD_LABELS } from "@/components/events/constants";
import type { Row } from "../export/format";
import { registerDataset } from "./datasets";

// Event bookings, attendance and feedback; campaign delivery. Queries run as the
// signed-in user, so RLS limits rows (registrations: organisers of the event;
// campaigns: the sender or an approver).

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ["workshop", "online_training", "training_day", "mentoring_evening", "presentation", "prov_meeting", "apgmen_meeting", "lodge_visit",
  "new_mason_evening", "narrated_ceremony", "mentoring_lodge", "discover_freemasonry", "provincial_activity", "other"];

registerDataset({
  key: "events",
  label: "Event bookings and attendance",
  description: "One row per booking: event, person, booking status, check-in and feedback.",
  permission: ["events.manage", "reports.read"],
  exportPermission: ["events.manage", "reports.export"],
  columns: [
    { key: "starts_at", label: "Date", type: "date", width: 0.9 },
    { key: "event", label: "Event", width: 2 },
    { key: "kind", label: "Type", width: 1.2 },
    { key: "training", label: "Training", type: "boolean", width: 0.6 },
    { key: "name", label: "Name", width: 1.6 },
    { key: "status", label: "Booking", width: 0.9 },
    { key: "registered_at", label: "Booked", type: "date", width: 0.9 },
    { key: "checked_in_at", label: "Checked in", type: "date", width: 0.9 },
    { key: "checkin_method", label: "How", width: 1 },
    { key: "feedback_rating", label: "Rating", type: "number", width: 0.5 },
    { key: "feedback_comment", label: "Feedback", width: 2.2 },
  ],
  filters: [
    { key: "from", label: "From", type: "date" },
    { key: "to", label: "To", type: "date" },
    { key: "kind", label: "Type", type: "select", options: KINDS.map((k) => ({ value: k, label: kindLabel(k) })) },
    { key: "status", label: "Booking", type: "select", options: ["confirmed", "waitlisted", "attended", "no_show", "cancelled"].map((s) => ({ value: s, label: registrationLabel(s) })) },
  ],
  query: async (db, f) => {
    let q = db.from("registrations")
      .select("status, registered_at, checked_in_at, checkin_method, feedback_rating, feedback_comment, persons(display_name), events!inner(title, kind, is_training, starts_at)")
      .order("registered_at", { ascending: false }).limit(10000);
    if (f.from && DATE.test(f.from)) q = q.gte("events.starts_at", `${f.from}T00:00:00Z`);
    if (f.to && DATE.test(f.to)) q = q.lte("events.starts_at", `${f.to}T23:59:59Z`);
    if (f.kind && KINDS.includes(f.kind)) q = q.eq("events.kind", f.kind);
    if (f.status) q = q.eq("status", f.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => {
      const e = r.events as unknown as { title: string; kind: string; is_training: boolean; starts_at: string };
      return {
        starts_at: e.starts_at, event: e.title, kind: kindLabel(e.kind), training: e.is_training,
        name: (r.persons as unknown as { display_name: string } | null)?.display_name ?? "",
        status: registrationLabel(r.status), registered_at: r.registered_at, checked_in_at: r.checked_in_at,
        checkin_method: r.checkin_method ? CHECKIN_METHOD_LABELS[r.checkin_method] : "", feedback_rating: r.feedback_rating, feedback_comment: r.feedback_comment,
      } satisfies Row;
    }).sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at)));
  },
});

const STATUS: Record<string, string> = {
  draft: "Draft", pending_approval: "Awaiting approval", approved: "Approved", scheduled: "Scheduled", sending: "Sending", sent: "Sent", cancelled: "Cancelled", failed: "Failed",
};

registerDataset({
  key: "communications",
  label: "Campaign delivery",
  description: "Email campaigns with audience, approval and delivery figures. Opens are an estimate, where measurable.",
  permission: ["comms.use"],
  exportPermission: ["comms.approve", "reports.export"],
  columns: [
    { key: "sent_at", label: "Sent", type: "date", width: 0.9 },
    { key: "title", label: "Campaign", width: 2 },
    { key: "subject", label: "Subject", width: 2 },
    { key: "sender", label: "Sender", width: 1.4 },
    { key: "scope", label: "Scope", width: 1 },
    { key: "category", label: "Type", width: 0.8 },
    { key: "status", label: "Status", width: 0.9 },
    { key: "recipients", label: "Recipients", type: "number", width: 0.7 },
    { key: "excluded", label: "Not sent", type: "number", width: 0.6 },
    { key: "delivered", label: "Sent or delivered", type: "number", width: 0.7 },
    { key: "failed", label: "Bounced or failed", type: "number", width: 0.7 },
    { key: "opened", label: "Opened (estimate)", type: "number", width: 0.7 },
    { key: "clicked", label: "Clicked", type: "number", width: 0.6 },
    { key: "unsubscribed", label: "Unsubscribed", type: "number", width: 0.7 },
  ],
  filters: [
    { key: "from", label: "From", type: "date" },
    { key: "to", label: "To", type: "date" },
    { key: "status", label: "Status", type: "select", options: Object.entries(STATUS).map(([value, label]) => ({ value, label })) },
  ],
  query: async (db, f) => {
    let q = db.from("campaigns").select("id, title, subject, scope, category, status, sent_at, created_at, user_accounts!campaigns_created_by_fkey(persons(display_name))")
      .order("created_at", { ascending: false }).limit(1000);
    if (f.from && DATE.test(f.from)) q = q.gte("created_at", `${f.from}T00:00:00Z`);
    if (f.to && DATE.test(f.to)) q = q.lte("created_at", `${f.to}T23:59:59Z`);
    if (f.status && STATUS[f.status]) q = q.eq("status", f.status);
    const { data: campaigns, error } = await q;
    if (error) throw error;
    const ids = (campaigns ?? []).map((c) => c.id);
    const recips: { campaign_id: string; status: string; first_opened_at: string | null; first_clicked_at: string | null; unsubscribed_at: string | null }[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await db.from("campaign_recipients").select("campaign_id, status, first_opened_at, first_clicked_at, unsubscribed_at").in("campaign_id", ids.slice(i, i + 100)).limit(50000);
      recips.push(...(data ?? []));
    }
    const by = new Map<string, typeof recips>();
    for (const r of recips) by.set(r.campaign_id, [...(by.get(r.campaign_id) ?? []), r]);
    return (campaigns ?? []).map((c) => {
      const r = by.get(c.id) ?? [];
      const n = (fn: (x: (typeof r)[number]) => boolean) => r.filter(fn).length;
      return {
        sent_at: c.sent_at, title: c.title, subject: c.subject,
        sender: (c.user_accounts as unknown as { persons: { display_name: string } | null } | null)?.persons?.display_name ?? "",
        scope: c.scope === "province" ? "Province-wide" : "Allocated Lodges", category: c.category.replace(/^./, (x) => x.toUpperCase()), status: STATUS[c.status] ?? c.status,
        recipients: n((x) => x.status !== "excluded"), excluded: n((x) => x.status === "excluded"),
        delivered: n((x) => ["sent", "delivered"].includes(x.status)), failed: n((x) => ["bounced", "failed", "complained"].includes(x.status)),
        opened: n((x) => !!x.first_opened_at), clicked: n((x) => !!x.first_clicked_at), unsubscribed: n((x) => !!x.unsubscribed_at),
      } satisfies Row;
    });
  },
});
