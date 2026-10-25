import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, statusTone } from "@/components/ui/badge";
import { DescriptionList, EmptyState, PageHeader, Panel, Tabs, Timeline } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { progressionPrompt } from "@/lib/progression";
import { formatDate, formatDateTime, label } from "@/lib/utils";
import { progressionSettings } from "@/server/members/directory";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import {
  ClearCorrectionButton, CorrectionForm, DegreeForm, JourneyForm, PersonalMentorForm, PersonContactForm, PersonNoteForm,
} from "./member-forms";
import { FIELDS } from "@/components/members/fields";
import { ContactRequestDecision } from "@/components/members/contact-requests";
import { WithAccounts } from "@/components/members/with-accounts";

export const metadata: Metadata = { title: "Member" };

const TABS = ["overview", "contacts", "notes", "support", "learning"] as const;
type Tab = (typeof TABS)[number];
type Correction = { value: string | null; reason: string; by: string; at: string };
const DEGREE_ORDER = ["initiation", "passing", "raising", "joining", "exaltation", "installation"];

export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const session = await requirePermission("members.read.basic");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const db = await supabaseServer();

  // Restricted records are hidden by RLS; treat them exactly like a missing record.
  const { data: person } = await db.from("persons")
    .select("id, title, first_name, last_name, display_name, email, phone, membership_number, status, status_changed_on, source, local_corrections, is_restricted")
    .eq("id", id).maybeSingle();
  if (!person) notFound();

  const { data: memberships } = await db.from("lodge_memberships")
    .select("id, lodge_id, is_primary, joined_on, join_type, left_on, leaving_reason, lodges(name, number)").eq("person_id", id)
    .order("left_on", { ascending: false, nullsFirst: true }).order("joined_on");
  const current = (memberships ?? []).filter((m) => !m.left_on);
  const currentLodgeIds = current.map((m) => m.lodge_id);
  const allocated = currentLodgeIds.some((l) => session.allocatedLodgeIds.includes(l));
  const canWrite = can(session, "members.write.all") || (can(session, "members.write.allocated") && allocated);
  const canDetail = can(session, "members.read.detail.all") || (can(session, "members.read.detail.allocated") && allocated);
  const canLearning = can(session, "learning.records.read");
  const tabList = TABS.filter((t) => t !== "learning" || canLearning);
  const tab = (tabList.includes(sp.tab as Tab) ? sp.tab : "overview") as Tab;
  const lodgeLabel = (m: { lodges: unknown }) => { const l = m.lodges as { name: string; number: number } | null; return l ? `${l.name} No. ${l.number}` : "Unknown Lodge"; };
  const primary = current.find((m) => m.is_primary) ?? current[0];

  const tabs = tabList.map((t) => ({ key: t, label: { overview: "Overview", contacts: "Contacts", notes: "Notes", support: "Support", learning: "Learning" }[t], href: `/members/${id}?tab=${t}` }));

  return (
    <WithAccounts>
      <PageHeader
        breadcrumbs={[{ href: "/members", label: "Members" }]}
        title={person.display_name}
        description={[primary ? lodgeLabel(primary) : null, person.membership_number ? `Membership no. ${person.membership_number}` : null].filter(Boolean).join(" · ")}
        meta={
          <>
            {person.status !== "active" && <Badge>{label(person.status)}</Badge>}
            {current.length > 1 && <Badge tone="navy">Member of {current.length} Lodges</Badge>}
            {!canWrite && <span className="text-sm text-muted">View only</span>}
          </>
        }
        actions={canWrite ? <PersonContactForm personId={id} /> : undefined}
      />
      <ContactRequests />
      <Tabs tabs={tabs} current={tab} />
      {tab === "overview" && <Overview />}
      {tab === "contacts" && <Contacts />}
      {tab === "notes" && <Notes />}
      {tab === "support" && <Support />}
      {tab === "learning" && canLearning && <Learning />}
    </WithAccounts>
  );

  async function ContactRequests() {
    if (!can(session, "members.write.all") && !can(session, "admin.users")) return null;
    const { data: requests } = await db.from("contact_change_requests").select("id, details, created_at").eq("person_id", id).eq("status", "open").order("created_at");
    if (!requests?.length) return null;
    return (
      <div className="mb-5">
        <Panel title="Requested changes to contact details" description="Raised by the member from My Account. Update the record, then mark the request done.">
          <ul className="space-y-4">
            {requests.map((r) => (
              <li key={r.id} className="rounded-md bg-canvas p-3 text-sm">
                <div className="text-[13px] text-muted">{formatDateTime(r.created_at)}</div>
                <p className="whitespace-pre-line">{r.details}</p>
                <ContactRequestDecision personId={id} requestId={r.id} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    );
  }

  async function Overview() {
    const [{ data: degrees }, { data: journey }] = await Promise.all([
      db.from("degree_events").select("id, kind, event_date, source, lodges(name, number)").eq("person_id", id).order("event_date"),
      canDetail
        ? db.from("member_journeys").select(`stage, royal_arch, journey_status, next_review_on, learning_opt_in, personal_mentor_allocated,
            personal_mentor_confirmed_on, personal_mentor_review_on, updated_at,
            confirmed_by:persons!member_journeys_personal_mentor_confirmed_by_fkey(display_name),
            mentor:persons!member_journeys_personal_mentor_person_id_fkey(display_name)`).eq("person_id", id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const corrections = (person!.local_corrections ?? {}) as Record<string, Correction>;
    const settings = progressionSettings(session.org.settings);
    const dateOf = (k: string) => (degrees ?? []).filter((d) => d.kind === k).at(-1)?.event_date ?? null;
    const prompt = journey ? progressionPrompt({ initiated_on: dateOf("initiation"), passed_on: dateOf("passing"), raised_on: dateOf("raising"), status: person!.status }, settings) : null;
    const sortedDegrees = [...(degrees ?? [])].sort((a, b) => a.event_date.localeCompare(b.event_date) || DEGREE_ORDER.indexOf(a.kind) - DEGREE_ORDER.indexOf(b.kind));
    const field = (keys: string[], v: string | null) => {
      const c = keys.map((k) => corrections[k]).find(Boolean);
      return (
        <span>
          {v || <span className="text-muted">Not recorded</span>}
          {c && <> <Badge tone="teal">Local correction</Badge><span className="block text-[13px] text-muted">{c.reason} · {formatDate(c.at)}</span></>}
        </span>
      );
    };
    const nameOf = (x: unknown) => (x as { display_name: string } | null)?.display_name ?? null;

    return (
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {canDetail ? (
            <Panel title="Mentoring journey" description="An operational record of where the Brother is. Prompts suggest a conversation; they are never judgements."
              actions={canWrite ? <JourneyForm personId={id} journey={journey} /> : undefined}>
              {journey ? (
                <>
                  {prompt && <p className="mb-4 rounded-md bg-teal-50 px-4 py-2.5 text-sm text-teal-800">{prompt}</p>}
                  <DescriptionList items={[
                    { label: "Stage", value: label(journey.stage) },
                    { label: "Journey status", value: label(journey.journey_status) },
                    { label: "Royal Arch (for information)", value: label(journey.royal_arch) },
                    { label: "Next review", value: journey.next_review_on ? formatDate(journey.next_review_on) : null },
                    { label: "Academy learning", value: journey.learning_opt_in ? "Taking part" : "Not taking part" },
                    { label: "Last updated", value: formatDate(journey.updated_at) },
                  ]} />
                </>
              ) : <EmptyState title="No mentoring journey recorded yet">{canWrite ? "Start one to record his stage and Personal Mentor." : "Those responsible for his Lodge can start one."}</EmptyState>}
            </Panel>
          ) : (
            <Panel title="Mentoring journey">
              <p className="text-sm text-muted">Mentoring journeys are visible to the Assistant allocated to his Lodge and to Provincial leadership.</p>
            </Panel>
          )}

          {canDetail && journey && (
            <Panel title="Personal Mentor" actions={canWrite ? <PersonalMentorForm personId={id} journey={journey} lodgeId={primary?.lodge_id} /> : undefined}>
              <DescriptionList items={[
                { label: "Personal Mentor allocated", value: label(journey.personal_mentor_allocated) },
                { label: "Personal Mentor", value: nameOf(journey.mentor) ?? (journey.personal_mentor_allocated === "yes" ? "Not named (optional)" : null) },
                { label: "Date confirmed", value: journey.personal_mentor_confirmed_on ? formatDate(journey.personal_mentor_confirmed_on) : null },
                { label: "Confirmed by", value: nameOf(journey.confirmed_by) },
                { label: "Review date", value: journey.personal_mentor_review_on ? formatDate(journey.personal_mentor_review_on) : null },
              ]} />
            </Panel>
          )}

          <Panel title="Degrees" actions={canWrite ? <DegreeForm personId={id} lodges={current.map((m) => ({ id: m.lodge_id, label: lodgeLabel(m) }))} /> : undefined}>
            {sortedDegrees.length ? (
              <Timeline items={sortedDegrees.map((d) => ({
                id: d.id, when: formatDate(d.event_date), title: label(d.kind),
                meta: [d.lodges ? lodgeLabel(d) : null, d.source === "local" ? "Recorded in the Hub" : null].filter(Boolean).join(" · ") || undefined,
              }))} />
            ) : <p className="text-sm text-muted">No degrees recorded. They arrive through membership imports.</p>}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Basic details" actions={canWrite ? <CorrectionForm personId={id} current={{ title: person!.title, first_name: person!.first_name, last_name: person!.last_name, email: person!.email, phone: person!.phone }} /> : undefined}>
            <DescriptionList columns={1} items={[
              { label: "Name", value: field(["title", "first_name", "last_name"], person!.display_name) },
              { label: "Email", value: field(["email"], person!.email) },
              { label: "Telephone", value: field(["phone"], person!.phone) },
              { label: "Membership number", value: person!.membership_number },
              { label: "Membership status", value: `${label(person!.status)}${person!.status_changed_on ? ` since ${formatDate(person!.status_changed_on)}` : ""}` },
              { label: "Source", value: person!.source === "import" ? "Membership import" : "Recorded in the Hub" },
            ]} />
            {canWrite && Object.keys(corrections).length > 0 && (
              <div className="mt-4 border-t border-line pt-3 text-sm">
                <p className="mb-2 font-medium">Local corrections</p>
                <ul className="space-y-2">
                  {Object.entries(corrections).map(([k, c]) => (
                    <li key={k} className="flex items-start justify-between gap-2">
                      <span>{FIELDS.find((f) => f.value === k)?.label ?? label(k)}: {c.value ?? <span className="text-muted">cleared</span>}</span>
                      <ClearCorrectionButton personId={id} field={k} />
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[13px] text-muted">Release a correction to let the next membership import update it.</p>
              </div>
            )}
          </Panel>

          <Panel title="Lodge memberships" padded={false}>
            {memberships?.length ? (
              <ul className="divide-y divide-line">
                {memberships.map((m) => (
                  <li key={m.id} className="px-5 py-3 text-sm">
                    <Link href={`/lodges/${m.lodge_id}`} className="font-medium text-navy-800 hover:underline">{lodgeLabel(m)}</Link>
                    {m.is_primary && !m.left_on && <> <Badge tone="navy">Primary</Badge></>}
                    {m.left_on && <> <Badge>Former</Badge></>}
                    <div className="text-muted">
                      {m.join_type ? label(m.join_type) : "Joined"}{m.joined_on ? ` ${formatDate(m.joined_on)}` : ""}
                      {m.left_on ? ` · left ${formatDate(m.left_on)}${m.leaving_reason ? ` (${label(m.leaving_reason)})` : ""}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="p-5 text-sm text-muted">No Lodge memberships recorded.</p>}
          </Panel>
        </div>
      </div>
    );
  }

  async function Contacts() {
    if (!canDetail) {
      return <EmptyState title="Contacts are visible to those responsible for his Lodge">Provincial leadership and the allocated Assistant can see contacts about this Brother.</EmptyState>;
    }
    const { data: contacts } = await db.from("contacts").select("id, method, occurred_on, summary, outcome, follow_up_on, visibility").eq("person_id", id).order("occurred_on", { ascending: false }).limit(100);
    return (
      <Panel title="Contacts" description="Quick records of conversations about or with this Brother.">
        {contacts?.length ? (
          <Timeline items={contacts.map((c) => ({
            id: c.id, when: formatDate(c.occurred_on),
            title: <>{label(c.method)}{c.visibility !== "ordinary" && <> <Badge tone="navy">{label(c.visibility)}</Badge></>}</>,
            body: c.summary, meta: [c.outcome, c.follow_up_on && `Follow up ${formatDate(c.follow_up_on)}`].filter(Boolean).join(" · ") || undefined,
          }))} />
        ) : <EmptyState title="No contacts recorded yet">{canWrite ? "Use Log contact to record a conversation." : undefined}</EmptyState>}
      </Panel>
    );
  }

  async function Notes() {
    const { data: notes } = await db.from("notes").select("id, body, visibility, created_at, user_accounts!notes_author_account_id_fkey(persons(display_name))")
      .eq("subject_type", "person").eq("subject_id", id).is("archived_at", null).order("created_at", { ascending: false });
    const visibilities = [
      ...(canWrite ? [{ value: "ordinary", label: "Ordinary: those responsible for his Lodge" }] : []),
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
                      <span className="font-medium text-ink">{(n.user_accounts as unknown as { persons: { display_name: string } | null } | null)?.persons?.display_name ?? "Provincial team member"}</span>
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
        {visibilities.length > 0 && <Panel title="Add a note"><PersonNoteForm personId={id} visibilities={visibilities} /></Panel>}
      </div>
    );
  }

  async function Support() {
    const { data: cases } = await db.from("cases").select("id, reference, title, status, due_on, created_at").eq("member_person_id", id).eq("kind", "request").order("created_at", { ascending: false });
    const { data: tasks } = await db.from("tasks").select("id, title, status, due_on").eq("linked_type", "person").eq("linked_id", id).order("created_at", { ascending: false }).limit(50);
    return (
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Panel title="Support requests about this Brother" padded={false}
            actions={can(session, "cases.write.all") || can(session, "cases.write.allocated") ? <Link className="text-sm font-medium text-navy-800 underline" href={`/support/new?member=${id}${primary ? `&lodge=${primary.lodge_id}` : ""}`}>New request</Link> : undefined}>
            {cases?.length ? (
              <Table className="rounded-none border-0">
                <THead><TH>Reference</TH><TH>Request</TH><TH>Status</TH><TH className="hidden sm:table-cell">Due</TH></THead>
                <TBody>
                  {cases.map((c) => (
                    <TR key={c.id}>
                      <TD className="tabular-nums">{c.reference}</TD>
                      <TD><RowLink href={`/support/${c.id}`}>{c.title}</RowLink></TD>
                      <TD><Badge tone={statusTone(c.status)}>{label(c.status)}</Badge></TD>
                      <TD className="hidden sm:table-cell">{formatDate(c.due_on)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : <div className="p-5"><EmptyState title="No support requests you can see" /></div>}
          </Panel>
        </div>
        <Panel title="Tasks">
          <ul className="space-y-2 text-sm">
            {(tasks ?? []).map((t) => (
              <li key={t.id}><Link href={`/tasks/${t.id}`} className="font-medium text-navy-800 hover:underline">{t.title}</Link>
                <span className="text-muted"> · {label(t.status)}{t.due_on ? ` · due ${formatDate(t.due_on)}` : ""}</span></li>
            ))}
            {!tasks?.length && <li className="text-muted">No tasks you can see.</li>}
          </ul>
        </Panel>
      </div>
    );
  }

  async function Learning() {
    const { data: records } = await db.from("v_learning_records").select("id, course_title, status, enrolled_at, completed_at, due_on, lessons_completed, lessons_required").eq("person_id", id).order("enrolled_at", { ascending: false });
    return (
      <Panel title="Learning summary" description="Academy courses. Learning is offered, never required." padded={false}>
        {records?.length ? (
          <Table className="rounded-none border-0">
            <THead><TH>Course</TH><TH>Status</TH><TH className="hidden sm:table-cell">Progress</TH><TH className="hidden md:table-cell">Completed</TH></THead>
            <TBody>
              {records.map((r) => (
                <TR key={r.id}>
                  <TD>{r.course_title}</TD>
                  <TD><Badge tone={statusTone(r.status)}>{label(r.status)}</Badge></TD>
                  <TD className="hidden sm:table-cell tabular-nums">{r.lessons_completed ?? 0} of {r.lessons_required ?? 0} lessons</TD>
                  <TD className="hidden md:table-cell">{formatDate(r.completed_at)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No Academy learning recorded" /></div>}
      </Panel>
    );
  }
}
