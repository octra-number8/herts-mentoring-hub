import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, statusTone } from "@/components/ui/badge";
import { DescriptionList, EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { ATTENDANCE_LABELS, meetingKindLabel } from "@/components/team/kinds";
import {
  AddAttendeeForm, AgendaItemControls, AgendaItemForm, ApproveMinutesButton, AttendanceSelect, DecisionForm, EditAgendaItemForm,
  EditMeetingForm, MeetingActionForm, MinutesForm, RemoveAttendeeButton,
} from "@/components/team/team-forms";
import { renderMarkdown } from "@/lib/markdown";
import { formatDate, formatDateTime, label } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { WithAccounts } from "@/components/members/with-accounts";

export const metadata: Metadata = { title: "Meeting" };

type Named = { persons: { display_name: string } | null } | null;
const nm = (a: unknown) => (a as Named)?.persons?.display_name ?? null;
const pn = (p: unknown) => (p as { display_name: string } | null)?.display_name ?? null;

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("team.use");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await supabaseServer();

  // Leadership meetings are hidden by RLS from anyone not entitled to them.
  const { data: m } = await db.from("meetings").select("*, approver:user_accounts!meetings_minutes_approved_by_fkey(persons(display_name))").eq("id", id).maybeSingle();
  if (!m) notFound();
  const manage = can(session, "meetings.manage");

  const [{ data: items }, { data: attendees }, { data: decisions }, { data: tasks }, { data: docs }] = await Promise.all([
    db.from("meeting_agenda_items").select("id, position, title, notes, document_id, document_url, presenter:persons!meeting_agenda_items_presenter_person_id_fkey(display_name)").eq("meeting_id", id).order("position").order("id"),
    db.from("meeting_attendees").select("person_id, attendance, persons(display_name)").eq("meeting_id", id),
    db.from("meeting_decisions").select("id, decision, agenda_item_id, created_at").eq("meeting_id", id).order("created_at"),
    db.from("tasks").select("id, title, status, due_on, owner:user_accounts!tasks_owner_account_id_fkey(persons(display_name))").eq("linked_type", "meeting").eq("linked_id", id).order("created_at"),
    manage ? db.from("documents").select("id, reference, title").is("archived_at", null).order("reference").limit(300) : Promise.resolve({ data: [] }),
  ]);
  const docIds = [...new Set((items ?? []).map((i) => i.document_id).filter((v): v is string => !!v))];
  const { data: linkedDocs } = docIds.length ? await db.from("documents").select("id, reference, title").in("id", docIds) : { data: [] };
  const docOptions = (docs ?? []).map((d) => ({ value: d.id, label: `${d.reference} ${d.title}` }));
  const sortedAttendees = [...(attendees ?? [])].sort((a, b) => (pn(a.persons) ?? "").localeCompare(pn(b.persons) ?? ""));
  const counts = Object.fromEntries(Object.keys(ATTENDANCE_LABELS).map((k) => [k, (attendees ?? []).filter((a) => a.attendance === k).length]));
  const itemTitle = (iid: string | null) => (items ?? []).find((i) => i.id === iid)?.title;

  return (
    <WithAccounts>
      <PageHeader
        breadcrumbs={[{ href: "/team", label: "Team" }, { href: "/team/meetings", label: "Meetings" }]}
        title={m.title}
        description={[formatDateTime(m.starts_at), m.ends_at ? `until ${formatDateTime(m.ends_at)}` : null, m.location].filter(Boolean).join(" · ")}
        meta={
          <>
            <Badge tone="navy">{meetingKindLabel(m.kind)}</Badge>
            {m.status !== "scheduled" && <Badge tone={m.status === "held" ? "success" : "neutral"}>{label(m.status)}</Badge>}
            {m.online_url && <a href={m.online_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-navy-800 underline">Join online</a>}
          </>
        }
        actions={manage ? <EditMeetingForm m={m} /> : undefined}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Agenda" actions={manage ? <AgendaItemForm meetingId={id} docs={docOptions} /> : undefined}>
            {items?.length ? (
              <ol className="divide-y divide-line">
                {items.map((it, n) => {
                  const doc = (linkedDocs ?? []).find((d) => d.id === it.document_id);
                  return (
                    <li key={it.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-medium"><span className="tabular-nums text-muted">{n + 1}.</span> {it.title}</span>
                          {pn(it.presenter) && <div className="text-[13px] text-muted">Presented by {pn(it.presenter)}</div>}
                          {it.notes && <p className="mt-1 whitespace-pre-line text-sm text-slate-ink">{it.notes}</p>}
                          <div className="mt-1 flex flex-wrap gap-3 text-sm">
                            {it.document_id && (doc ? <Link href={`/library/${doc.id}`} className="text-navy-800 underline">{doc.reference} {doc.title}</Link> : <span className="text-muted">A library document you cannot open</span>)}
                            {it.document_url && <a href={it.document_url} target="_blank" rel="noopener noreferrer" className="break-all text-navy-800 underline">Paper (opens in a new tab)</a>}
                          </div>
                        </div>
                        {manage && (
                          <span className="flex flex-wrap gap-1">
                            <EditAgendaItemForm meetingId={id} item={it} docs={docOptions} />
                            <AgendaItemControls meetingId={id} itemId={it.id} first={n === 0} last={n === items.length - 1} />
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : <EmptyState title="No agenda yet">{manage ? "Add the first item." : undefined}</EmptyState>}
          </Panel>

          <Panel title="Minutes" description={m.minutes_status === "approved" ? `Approved${nm(m.approver) ? ` by ${nm(m.approver)}` : ""}.` : m.minutes_status === "draft" ? "Draft, awaiting approval." : undefined}
            actions={manage && m.minutes_status === "draft" ? <ApproveMinutesButton meetingId={id} /> : m.minutes_status !== "none" ? <Badge tone={statusTone(m.minutes_status)}>{label(m.minutes_status)}</Badge> : undefined}>
            {m.minutes ? <div className="prose-hub text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.minutes) }} /> : <p className="text-sm text-muted">No minutes recorded yet.</p>}
            {manage && (
              <details className="mt-4 border-t border-line pt-3" open={!m.minutes}>
                <summary className="cursor-pointer text-sm font-medium text-navy-800">{m.minutes ? "Edit minutes" : "Write minutes"}</summary>
                <div className="mt-3"><MinutesForm meetingId={id} minutes={m.minutes} /></div>
              </details>
            )}
          </Panel>

          <Panel title="Decisions" actions={manage ? <DecisionForm meetingId={id} items={(items ?? []).map((i) => ({ value: i.id, label: i.title }))} /> : undefined}>
            {decisions?.length ? (
              <ul className="space-y-3 text-sm">
                {decisions.map((d) => (
                  <li key={d.id} className="rounded-md bg-canvas p-3">
                    <p className="whitespace-pre-line">{d.decision}</p>
                    <div className="mt-1 text-[13px] text-muted">{formatDate(d.created_at)}{itemTitle(d.agenda_item_id) ? ` · ${itemTitle(d.agenda_item_id)}` : ""}</div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No decisions recorded.</p>}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Details">
            <DescriptionList columns={1} items={[
              { label: "Kind", value: meetingKindLabel(m.kind) },
              { label: "Starts", value: formatDateTime(m.starts_at) },
              { label: "Location", value: m.location },
              { label: "Online", value: m.online_url ? <a href={m.online_url} target="_blank" rel="noopener noreferrer" className="break-all text-navy-800 underline">{m.online_url}</a> : null },
            ]} />
          </Panel>

          <Panel title="Attendees" description={attendees?.length ? Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${ATTENDANCE_LABELS[k].toLowerCase()}`).join(" · ") : undefined}
            actions={manage ? <AddAttendeeForm meetingId={id} /> : undefined}>
            {sortedAttendees.length ? (
              <ul className="space-y-2 text-sm">
                {sortedAttendees.map((a) => (
                  <li key={a.person_id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{pn(a.persons) ?? "Team member"}</span>
                    {manage ? (
                      <span className="flex flex-wrap items-center gap-1">
                        <AttendanceSelect meetingId={id} personId={a.person_id} current={a.attendance} name={pn(a.persons) ?? "attendee"} />
                        <RemoveAttendeeButton meetingId={id} personId={a.person_id} />
                      </span>
                    ) : <Badge tone={a.attendance === "attended" ? "success" : "neutral"}>{ATTENDANCE_LABELS[a.attendance]}</Badge>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No one added yet.</p>}
          </Panel>

          <Panel title="Actions" description="Actions become tasks in the central task list, linked to this meeting." actions={manage ? <MeetingActionForm meetingId={id} /> : undefined}>
            <ul className="space-y-2 text-sm">
              {(tasks ?? []).map((t) => (
                <li key={t.id}>
                  <Link href={`/tasks/${t.id}`} className="font-medium text-navy-800 hover:underline">{t.title}</Link>
                  <span className="text-muted"> · {label(t.status)}{nm(t.owner) ? ` · ${nm(t.owner)}` : ""}{t.due_on ? ` · due ${formatDate(t.due_on)}` : ""}</span>
                </li>
              ))}
              {!tasks?.length && <li className="text-muted">No actions you can see.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </WithAccounts>
  );
}
