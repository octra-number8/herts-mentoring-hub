import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, mentoringStatusTone, statusTone } from "@/components/ui/badge";
import { DescriptionList, EmptyState, PageHeader, Panel, Tabs, Timeline } from "@/components/ui/layout";
import { LodgeLearning } from "@/components/academy/lodge-learning";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { progressionPrompt, type ProgressionSettings } from "@/lib/progression";
import { serverEnv } from "@/lib/env";
import { formatDate, formatDateTime, label } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import {
  AddNoteForm, AddTaskForm, AppointmentForm, ArrangementsForm, CompleteVisitForm, ContactForm, DetailsForm,
  ProposalDecision, ReviewForm, StatusForm, VisitForm,
} from "./lodge-forms";

export const metadata: Metadata = { title: "Lodge" };

const TABS = ["overview", "activity", "members", "learning", "notes", "support"] as const;
type Tab = (typeof TABS)[number];

export default async function LodgePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const session = await requirePermission("lodges.read");
  const { id } = await params;
  const canLearning = can(session, "learning.records.read") || can(session, "members.read.detail.all")
    || (can(session, "members.read.detail.allocated") && session.allocatedLodgeIds.includes(id));
  const visibleTabs = TABS.filter((t) => t !== "learning" || canLearning);
  const requested = (await searchParams).tab as Tab;
  const tab = (visibleTabs.includes(requested) ? requested : "overview") as Tab;
  const db = await supabaseServer();

  const { data: found } = await db.from("v_lodge_overview").select("*").eq("id", id).maybeSingle();
  if (!found) notFound();
  const lodge = found;
  const canEdit = can(session, "lodges.write.all") || (can(session, "lodges.write.allocated") && session.allocatedLodgeIds.includes(id));
  const canActivity = can(session, "activity.write.all") || (can(session, "activity.write.allocated") && session.allocatedLodgeIds.includes(id));
  const canSeeDetail = can(session, "activity.read.all") || (can(session, "activity.read.allocated") && session.allocatedLodgeIds.includes(id));

  const [{ data: details }, { data: statuses }, { data: centres }] = await Promise.all([
    db.from("lodges").select("*").eq("id", id).single(),
    db.from("mentoring_statuses").select("id, key, label").eq("active", true).order("position"),
    db.from("meeting_centres").select("id, name").order("name"),
  ]);

  const tabs = visibleTabs.map((t) => ({ key: t, label: { overview: "Overview", activity: "Activity", members: "Members", learning: "Learning", notes: "Notes", support: "Support" }[t], href: `/lodges/${id}?tab=${t}` }));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/lodges", label: "Lodges" }]}
        title={`${lodge.name} No. ${lodge.number}`}
        description={[lodge.meeting_centre, lodge.meeting_pattern].filter(Boolean).join(" · ")}
        meta={
          <>
            {lodge.mentoring_status && <Badge tone={mentoringStatusTone(lodge.mentoring_status_key)}>{lodge.mentoring_status}</Badge>}
            {lodge.status !== "active" && <Badge tone="warning">{label(lodge.status)}</Badge>}
            {lodge.apgmen ? <span className="text-sm text-muted">Assistant: {lodge.apgmen}{lodge.cover_apgmen ? ` (cover: ${lodge.cover_apgmen})` : ""}</span> : <Badge tone="warning">Unallocated</Badge>}
            {!canEdit && <span className="text-sm text-muted">View only: not allocated to you</span>}
          </>
        }
        actions={canActivity ? (
          <>
            <ContactForm lodgeId={id} />
            <VisitForm lodgeId={id} canCalendar={can(session, "events.manage")} />
            <ReviewForm lodgeId={id} />
          </>
        ) : undefined}
      />
      <Tabs tabs={tabs} current={tab} />
      {tab === "overview" && <Overview />}
      {tab === "activity" && <Activity />}
      {tab === "members" && <Members />}
      {tab === "learning" && <LodgeLearning db={db} lodgeId={id} joinUrl={`${serverEnv().appUrl}/join`} />}
      {tab === "notes" && <Notes />}
      {tab === "support" && <Support />}
    </>
  );

  async function Overview() {
    const [{ data: appts }, { data: profile }, { data: history }, { data: allocations }, { data: proposals }] = await Promise.all([
      db.from("lodge_appointments").select("id, office, confirmed, starts_on, ends_on, person_id, persons(display_name)").eq("lodge_id", id).order("starts_on", { ascending: false }),
      db.from("lodge_mentoring_profiles").select("*").eq("lodge_id", id).maybeSingle(),
      db.from("lodge_status_history").select("id, changed_at, status:mentoring_statuses!lodge_status_history_status_id_fkey(label)").eq("lodge_id", id).order("changed_at", { ascending: false }).limit(10),
      db.from("lodge_allocations").select("id, kind, starts_on, ends_on, reason, persons(display_name), areas(name)").eq("lodge_id", id).order("starts_on", { ascending: false }),
      canEdit ? db.from("lodge_change_proposals").select("id, changes, note, created_at, status").eq("lodge_id", id).eq("status", "pending") : Promise.resolve({ data: [] }),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const current = (appts ?? []).filter((a) => a.starts_on <= today && (!a.ends_on || a.ends_on >= today));
    const past = (appts ?? []).filter((a) => a.ends_on && a.ends_on < today);
    const officeOrder = ["worshipful_master", "secretary", "lodge_mentor", "assistant_lodge_mentor", "membership_officer", "almoner", "royal_arch_representative"];
    return (
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {proposals && proposals.length > 0 && (
            <Panel title="Changes proposed by the Lodge Mentor">
              <ul className="space-y-3">
                {proposals.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md bg-canvas p-3 text-sm">
                    <div>
                      {Object.entries(p.changes as Record<string, string>).map(([k, v]) => <div key={k}><span className="text-muted">{label(k)}:</span> {String(v)}</div>)}
                      {p.note && <p className="mt-1 text-muted">{p.note}</p>}
                    </div>
                    <ProposalDecision lodgeId={id} proposalId={p.id} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Officers and mentoring appointments" actions={canEdit ? <AppointmentForm lodgeId={id} /> : undefined} padded={false}>
            <Table className="rounded-none border-0">
              <THead><TH>Office</TH><TH>Held by</TH><TH>Since</TH></THead>
              <TBody>
                {officeOrder.map((office) => {
                  const a = current.find((x) => x.office === office);
                  if (!a && !["worshipful_master", "secretary", "lodge_mentor", "membership_officer"].includes(office)) return null;
                  return (
                    <TR key={office}>
                      <TD className="font-medium">{label(office)}</TD>
                      <TD>{a?.person_id ? <>{(a.persons as unknown as { display_name: string }).display_name}{!a.confirmed && <> <Badge tone="warning">Unconfirmed</Badge></>}</> : <Badge tone="warning">Vacant</Badge>}</TD>
                      <TD>{a ? formatDate(a.starts_on) : ""}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {past.length > 0 && (
              <details className="border-t border-line px-5 py-3 text-sm">
                <summary className="cursor-pointer font-medium text-navy-800">Appointment history ({past.length})</summary>
                <ul className="mt-2 space-y-1">
                  {past.map((a) => <li key={a.id}>{label(a.office)}: {a.person_id ? (a.persons as unknown as { display_name: string }).display_name : "Vacant"} · {formatDate(a.starts_on)} to {formatDate(a.ends_on)}</li>)}
                </ul>
              </details>
            )}
          </Panel>

          <Panel title="Mentoring arrangements" description="Light touch: record what is useful." actions={canEdit ? <ArrangementsForm lodgeId={id} profile={profile} /> : undefined}>
            <DescriptionList items={[
              { label: "New members receive a Personal Mentor", value: profile ? label(profile.personal_mentors_for_new_members) : null },
              { label: "Last review", value: profile?.last_review_on ? formatDate(profile.last_review_on) : null },
              { label: "Arrangements", value: profile?.arrangements, wide: true },
              { label: "Guidance used", value: profile?.guidance_used },
              { label: "Training requirements", value: profile?.training_requirements },
              { label: "Opportunities", value: profile?.improvement_opportunities },
              { label: "Good practice", value: profile?.good_practice },
              { label: "Next review", value: profile?.next_review_on ? formatDate(profile.next_review_on) : null },
            ]} />
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Mentoring status" actions={canEdit ? <StatusForm lodgeId={id} statuses={statuses ?? []} current={details?.mentoring_status_id ?? null} /> : undefined}>
            <p className="text-sm text-muted">Describes where things stand operationally. It is not an assessment of the Lodge.</p>
            {history && history.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                {history.map((h) => <li key={h.id}><span className="text-muted">{formatDate(h.changed_at)}:</span> {(h.status as unknown as { label: string }).label}</li>)}
              </ul>
            ) : null}
          </Panel>
          <Panel title="Lodge details" actions={canEdit ? <DetailsForm lodge={details!} centres={centres ?? []} /> : undefined}>
            <DescriptionList columns={1} items={[
              { label: "Meeting centre", value: lodge.meeting_centre },
              { label: "Meeting pattern", value: lodge.meeting_pattern },
              { label: "Installation", value: details?.installation_month ? new Date(2000, details.installation_month - 1).toLocaleString("en-GB", { month: "long" }) : null },
              { label: "Members (latest import)", value: lodge.membership_count },
            ]} />
          </Panel>
          <Panel title="Allocation history">
            <ul className="space-y-2 text-sm">
              {(allocations ?? []).map((a) => (
                <li key={a.id}>
                  <span className="font-medium">{(a.persons as unknown as { display_name: string }).display_name}</span>{a.kind === "cover" && <> <Badge tone="teal">Cover</Badge></>}
                  <div className="text-muted">{formatDate(a.starts_on)} to {a.ends_on ? formatDate(a.ends_on) : "present"}{a.areas ? ` · ${(a.areas as unknown as { name: string }).name}` : ""}</div>
                </li>
              ))}
              {!allocations?.length && <li className="text-muted">Not yet allocated.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    );
  }

  async function Activity() {
    if (!canSeeDetail) {
      return <EmptyState title="Activity is visible to the allocated Assistant and Provincial leadership">Contacts, visits and reviews for this Lodge are restricted to those responsible for it.</EmptyState>;
    }
    const [{ data: contacts }, { data: visits }, { data: reviews }, { data: tasks }, { data: statusChanges }] = await Promise.all([
      db.from("contacts").select("id, method, occurred_on, summary, outcome, follow_up_on, visibility, created_by").eq("lodge_id", id).order("occurred_on", { ascending: false }).limit(100),
      db.from("visits").select("id, planned_for, purpose, status, outcome, follow_up").eq("lodge_id", id).order("planned_for", { ascending: false }),
      db.from("lodge_reviews").select("id, review_date, what_is_working, support_wanted, training_needs").eq("lodge_id", id).order("review_date", { ascending: false }),
      db.from("tasks").select("id, title, status, due_on, created_at").eq("lodge_id", id).order("created_at", { ascending: false }).limit(50),
      db.from("lodge_status_history").select("id, changed_at, status:mentoring_statuses!lodge_status_history_status_id_fkey(label)").eq("lodge_id", id).order("changed_at", { ascending: false }).limit(20),
    ]);
    const upcoming = (visits ?? []).filter((v) => v.status === "planned");
    type Item = { id: string; when: string; sort: string; title: React.ReactNode; body?: React.ReactNode; meta?: React.ReactNode };
    const items: Item[] = [
      ...(contacts ?? []).map((c) => ({ id: `c${c.id}`, sort: c.occurred_on, when: formatDate(c.occurred_on), title: <>Contact · {label(c.method)}{c.visibility !== "ordinary" && <> <Badge tone="navy">{label(c.visibility)}</Badge></>}</>,
        body: c.summary, meta: [c.outcome, c.follow_up_on && `Follow up ${formatDate(c.follow_up_on)}`].filter(Boolean).join(" · ") })),
      ...(visits ?? []).filter((v) => v.status !== "planned").map((v) => ({ id: `v${v.id}`, sort: v.planned_for.slice(0, 10), when: formatDate(v.planned_for), title: <>Visit · {label(v.status)}</>, body: v.purpose, meta: v.outcome })),
      ...(reviews ?? []).map((r) => ({ id: `r${r.id}`, sort: r.review_date, when: formatDate(r.review_date), title: "Mentoring review", body: [r.what_is_working, r.support_wanted].filter(Boolean).join(" · "), meta: r.training_needs ? `Training: ${r.training_needs}` : undefined })),
      ...(tasks ?? []).map((t) => ({ id: `t${t.id}`, sort: t.created_at.slice(0, 10), when: formatDate(t.created_at), title: <>Task · <Link className="underline" href={`/tasks/${t.id}`}>{t.title}</Link></>, meta: <Badge tone={statusTone(t.status)}>{label(t.status)}</Badge> })),
      ...(statusChanges ?? []).map((s) => ({ id: `s${s.id}`, sort: s.changed_at.slice(0, 10), when: formatDate(s.changed_at), title: `Status: ${(s.status as unknown as { label: string }).label}` })),
    ].sort((a, b) => b.sort.localeCompare(a.sort));
    return (
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Panel title="Timeline" description="Contacts, visits, reviews, tasks and status changes. Restricted notes and confidential matters never appear here.">
            {items.length ? <Timeline items={items} /> : <EmptyState title="Nothing recorded yet">Log a contact to start the record.</EmptyState>}
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Planned visits">
            {upcoming.length ? (
              <ul className="space-y-3 text-sm">
                {upcoming.map((v) => (
                  <li key={v.id} className="rounded-md bg-canvas p-3">
                    <div className="font-medium">{formatDateTime(v.planned_for)}</div>
                    <div className="text-muted">{v.purpose}</div>
                    {canActivity && <div className="mt-2"><CompleteVisitForm lodgeId={id} visitId={v.id} /></div>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No visits planned.</p>}
          </Panel>
          <Panel title="Open tasks" actions={canActivity ? <AddTaskForm lodgeId={id} /> : undefined}>
            <ul className="space-y-2 text-sm">
              {(tasks ?? []).filter((t) => !["done", "cancelled"].includes(t.status)).map((t) => (
                <li key={t.id}><Link href={`/tasks/${t.id}`} className="font-medium text-navy-800 hover:underline">{t.title}</Link>{t.due_on && <span className="text-muted"> · due {formatDate(t.due_on)}</span>}</li>
              ))}
              {!(tasks ?? []).some((t) => !["done", "cancelled"].includes(t.status)) && <li className="text-muted">No open tasks.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    );
  }

  async function Members() {
    const { data: org } = await db.from("organisations").select("settings").single();
    const settings = ((org?.settings as { progression?: ProgressionSettings })?.progression) ?? undefined;
    const { data: members } = await db.from("v_member_overview").select("*").eq("lodge_id", id).eq("status", "active").order("last_name");
    const detailVisible = (members ?? []).some((m) => m.stage);
    return (
      <Panel title={`Members (${members?.length ?? 0})`} description={detailVisible ? "Mentoring prompts are suggestions for a conversation, never judgements." : "Basic membership information. Mentoring journeys are visible to the allocated Assistant and Provincial leadership."} padded={false}>
        {members?.length ? (
          <Table className="rounded-none border-0">
            <THead><TH>Name</TH><TH>Initiated</TH><TH className="hidden md:table-cell">Passed</TH><TH className="hidden md:table-cell">Raised</TH>{detailVisible && <><TH>Stage</TH><TH>Personal Mentor</TH><TH>Prompt</TH></>}</THead>
            <TBody>
              {members.map((m) => {
                const prompt = detailVisible ? progressionPrompt(m, settings) : null;
                return (
                  <TR key={m.id}>
                    <TD><RowLink href={`/members/${m.id}`}>{m.display_name}</RowLink></TD>
                    <TD>{formatDate(m.initiated_on)}</TD>
                    <TD className="hidden md:table-cell">{formatDate(m.passed_on)}</TD>
                    <TD className="hidden md:table-cell">{formatDate(m.raised_on)}</TD>
                    {detailVisible && <>
                      <TD>{m.stage ? label(m.stage) : ""}</TD>
                      <TD>{m.personal_mentor_allocated ? label(m.personal_mentor_allocated) : ""}</TD>
                      <TD className="max-w-xs text-[13px] text-slate-ink">{prompt}</TD>
                    </>}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No current members recorded">Members arrive through approved membership imports.</EmptyState></div>}
      </Panel>
    );
  }

  async function Notes() {
    const { data: notes } = await db.from("notes").select("id, body, visibility, created_at, author_account_id, user_accounts!notes_author_account_id_fkey(persons(display_name))")
      .eq("subject_type", "lodge").eq("subject_id", id).is("archived_at", null).order("created_at", { ascending: false });
    const visibilities = [
      ...(canActivity ? [{ value: "ordinary", label: "Ordinary: those responsible for this Lodge" }] : []),
      ...(can(session, "notes.team") ? [{ value: "team", label: "Provincial team" }] : []),
      ...(can(session, "notes.leadership") ? [{ value: "leadership", label: "Leadership only" }] : []),
    ];
    return (
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Panel title="Notes" description="You see the notes your role allows. Mentioning someone notifies them but does not give them access.">
            {notes?.length ? (
              <ul className="divide-y divide-line">
                {notes.map((n) => (
                  <li key={n.id} className="py-3 first:pt-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                      <span className="font-medium text-ink">{(n.user_accounts as unknown as { persons: { display_name: string } } | null)?.persons.display_name ?? "Former user"}</span>
                      <span>{formatDateTime(n.created_at)}</span>
                      {n.visibility !== "ordinary" && <Badge tone="navy">{label(n.visibility)}</Badge>}
                    </div>
                    <p className="whitespace-pre-line text-sm">{n.body}</p>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No notes you can see" />}
          </Panel>
        </div>
        {visibilities.length > 0 && <Panel title="Add a note"><AddNoteForm lodgeId={id} visibilities={visibilities} /></Panel>}
      </div>
    );
  }

  async function Support() {
    const { data: cases } = await db.from("cases").select("id, reference, title, category_key, status, priority, due_on, created_at").eq("lodge_id", id).eq("kind", "request").order("created_at", { ascending: false });
    return (
      <Panel title="Support requests" description="Ordinary requests for this Lodge. Confidential concerns are handled separately and never listed here."
        actions={<Link className="text-sm font-medium text-navy-800 underline" href={`/support/new?lodge=${id}`}>New request</Link>} padded={false}>
        {cases?.length ? (
          <Table className="rounded-none border-0">
            <THead><TH>Reference</TH><TH>Request</TH><TH>Status</TH><TH>Due</TH></THead>
            <TBody>
              {cases.map((c) => (
                <TR key={c.id}>
                  <TD className="tabular-nums">{c.reference}</TD>
                  <TD><RowLink href={`/support/${c.id}`}>{c.title}</RowLink><div className="text-[13px] text-muted">{label(c.category_key)}</div></TD>
                  <TD><Badge tone={statusTone(c.status)}>{label(c.status)}</Badge></TD>
                  <TD>{formatDate(c.due_on)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No support requests you can see for this Lodge" /></div>}
      </Panel>
    );
  }
}
