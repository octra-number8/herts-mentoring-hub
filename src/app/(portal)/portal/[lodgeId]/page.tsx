import type { Metadata } from "next";
import Link from "next/link";
import { PortalArrangementsForm, ProposeChangeForm, RequestForm } from "@/components/portal/portal-forms";
import { Badge, statusTone } from "@/components/ui/badge";
import { DescriptionList, EmptyState, PageHeader, Panel, Tabs, Timeline } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { progressionPrompt, type ProgressionSettings } from "@/lib/progression";
import { formatDate, label } from "@/lib/utils";
import { requirePortalLodge } from "@/server/admin/portal-scope";
import { supabaseServer } from "@/server/supabase";
import { proposeChange, saveArrangements, submitRequest } from "../actions";

export const metadata: Metadata = { title: "My Lodge" };

const TABS = [
  { key: "overview", label: "Overview" }, { key: "members", label: "New members" }, { key: "support", label: "Support" }, { key: "activity", label: "Mentoring activity" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const month = (m: number | null) => (m ? new Date(2000, m - 1).toLocaleString("en-GB", { month: "long" }) : null);

export default async function PortalLodgePage({ params, searchParams }: { params: Promise<{ lodgeId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { lodgeId } = await params;
  const { can } = await requirePortalLodge(lodgeId);
  const sp = await searchParams;
  const tab = (TABS.some((t) => t.key === sp.tab) ? sp.tab : "overview") as Tab;
  const db = await supabaseServer();
  const { data: lodge } = await db.from("lodges").select("id, name, number, meeting_pattern, installation_month, website, email, meeting_centres(name, town)").eq("id", lodgeId).single();
  const centre = lodge?.meeting_centres as unknown as { name: string; town: string | null } | null;

  return (
    <>
      <PageHeader title={`${lodge?.name} No. ${lodge?.number}`} description={[centre?.name, lodge?.meeting_pattern].filter(Boolean).join(" · ")}
        actions={can.export ? <a href={`/portal/${lodgeId}/export`} className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 font-medium text-navy-800 hover:border-navy-600">Download Lodge report (CSV)</a> : undefined} />
      <Tabs tabs={TABS.map((t) => ({ ...t, href: `/portal/${lodgeId}?tab=${t.key}` }))} current={tab} />
      {tab === "overview" && <Overview />}
      {tab === "members" && <Members />}
      {tab === "support" && <Support />}
      {tab === "activity" && <Activity />}
    </>
  );

  async function Overview() {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: profile }, { data: appts }, { data: proposals }] = await Promise.all([
      db.from("lodge_mentoring_profiles").select("personal_mentors_for_new_members, arrangements, guidance_used, training_requirements, last_review_on, next_review_on").eq("lodge_id", lodgeId).maybeSingle(),
      db.from("lodge_appointments").select("id, office, starts_on, ends_on, persons(display_name)").eq("lodge_id", lodgeId),
      db.from("lodge_change_proposals").select("id, changes, status, created_at, decision_note").eq("lodge_id", lodgeId).order("created_at", { ascending: false }).limit(10),
    ]);
    const current = (appts ?? []).filter((a) => a.starts_on <= today && (!a.ends_on || a.ends_on >= today));
    return (
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Mentoring arrangements" description="How new members are looked after in your Lodge."
            actions={can.update ? <PortalArrangementsForm action={saveArrangements} lodgeId={lodgeId} profile={profile} /> : undefined}>
            <DescriptionList items={[
              { label: "New members receive a Personal Mentor", value: profile ? label(profile.personal_mentors_for_new_members) : null },
              { label: "Next review", value: profile?.next_review_on ? formatDate(profile.next_review_on) : null },
              { label: "Arrangements", value: profile?.arrangements, wide: true },
              { label: "Guidance used", value: profile?.guidance_used },
              { label: "Training that would help", value: profile?.training_requirements },
            ]} />
          </Panel>
          <Panel title="Officers" padded={false}>
            {current.length ? (
              <ul className="divide-y divide-line">
                {current.map((a) => <li key={a.id} className="flex justify-between gap-3 px-5 py-2.5 text-sm"><span className="text-muted">{label(a.office)}</span><span className="font-medium">{(a.persons as unknown as { display_name: string } | null)?.display_name ?? "Vacant"}</span></li>)}
              </ul>
            ) : <p className="p-5 text-sm text-muted">No officers recorded.</p>}
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Lodge information" actions={can.update && lodge ? <ProposeChangeForm action={proposeChange} lodge={lodge} /> : undefined}>
            <DescriptionList columns={1} items={[
              { label: "Meeting place", value: [centre?.name, centre?.town].filter(Boolean).join(", ") },
              { label: "Meeting pattern", value: lodge?.meeting_pattern },
              { label: "Installation", value: month(lodge?.installation_month ?? null) },
              { label: "Website", value: lodge?.website },
              { label: "Lodge email", value: lodge?.email },
            ]} />
          </Panel>
          {proposals && proposals.length > 0 && (
            <Panel title="Your proposed changes">
              <ul className="space-y-3 text-sm">
                {proposals.map((p) => (
                  <li key={p.id}>
                    <div className="flex items-center gap-2"><Badge tone={p.status === "accepted" ? "success" : p.status === "pending" ? "warning" : "neutral"}>{p.status === "pending" ? "Waiting for review" : label(p.status)}</Badge><span className="text-[13px] text-muted">{formatDate(p.created_at)}</span></div>
                    <div className="mt-1 text-[13px]">{Object.entries(p.changes as Record<string, unknown>).map(([k, v]) => `${label(k)}: ${k === "installation_month" ? month(Number(v)) : String(v)}`).join(" · ")}</div>
                    {p.decision_note && <div className="text-[13px] text-muted">{p.decision_note}</div>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Resources">
            <p className="text-sm">Guidance for Lodge Mentors and Personal Mentors is in the Academy.</p>
            <Link href="/academy/resources" className="mt-2 inline-block text-sm font-medium text-navy-800 underline">Mentoring resources</Link>
          </Panel>
        </div>
      </div>
    );
  }

  async function Members() {
    const [{ data: org }, { data: members }] = await Promise.all([
      db.from("organisations").select("settings").single(),
      db.from("v_member_overview").select("id, display_name, initiated_on, passed_on, raised_on, stage, personal_mentor_allocated, next_review_on, journey_status, status")
        .eq("lodge_id", lodgeId).eq("status", "active").not("stage", "is", null).order("initiated_on", { ascending: false }),
    ]);
    const settings = (org?.settings as { progression?: ProgressionSettings } | null)?.progression;
    return (
      <Panel title="New members" description="Brethren on their mentoring journey in your Lodge. Prompts suggest when a conversation may be welcome; they are never judgements." padded={false}>
        {members?.length ? (
          <Table className="rounded-none border-0" caption="New members">
            <THead><TH>Name</TH><TH>Stage</TH><TH className="hidden md:table-cell">Initiated</TH><TH className="hidden md:table-cell">Personal Mentor</TH><TH className="hidden lg:table-cell">Prompt</TH></THead>
            <TBody>
              {members.map((m) => (
                <TR key={m.id}>
                  <TD className="font-medium">{m.display_name}</TD>
                  <TD>{label(m.stage)}</TD>
                  <TD className="hidden md:table-cell">{formatDate(m.initiated_on)}</TD>
                  <TD className="hidden md:table-cell">{label(m.personal_mentor_allocated)}</TD>
                  <TD className="hidden max-w-xs text-[13px] lg:table-cell">{progressionPrompt(m as never, settings)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No new members on a mentoring journey">New Initiates appear here after an approved membership import.</EmptyState></div>}
      </Panel>
    );
  }

  async function Support() {
    const [{ data: cases }, { data: categories }] = await Promise.all([
      db.from("cases").select("id, reference, title, category_key, status, created_at").eq("lodge_id", lodgeId).eq("kind", "request").order("created_at", { ascending: false }),
      db.from("support_categories").select("key, label").eq("active", true).neq("key", "confidential").order("position"),
    ]);
    const catLabel = new Map((categories ?? []).map((c) => [c.key, c.label]));
    return (
      <Panel title="Support requests" description="Requests you have made for this Lodge."
        actions={can.create ? <RequestForm action={submitRequest} lodgeId={lodgeId} categories={(categories ?? []).map((c) => ({ value: c.key, label: c.label }))} /> : undefined} padded={false}>
        {cases?.length ? (
          <Table className="rounded-none border-0" caption="Support requests">
            <THead><TH>Reference</TH><TH>Request</TH><TH>Status</TH><TH className="hidden md:table-cell">Sent</TH></THead>
            <TBody>
              {cases.map((c) => (
                <TR key={c.id}>
                  <TD className="tabular-nums">{c.reference}</TD>
                  <TD className="font-medium">{c.title}<div className="text-[13px] font-normal text-muted">{catLabel.get(c.category_key) ?? label(c.category_key)}</div></TD>
                  <TD><Badge tone={statusTone(c.status)}>{label(c.status)}</Badge></TD>
                  <TD className="hidden md:table-cell">{formatDate(c.created_at)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <div className="p-5"><EmptyState title="No requests yet">{can.create ? "Ask for support whenever it would help: there should never be any surprises." : "Submitting requests here is not switched on for you. Please contact your Assistant Provincial Grand Mentor."}</EmptyState></div>}
      </Panel>
    );
  }

  async function Activity() {
    const { data: contacts } = await db.from("contacts").select("id, method, occurred_on, summary, outcome").eq("lodge_id", lodgeId).eq("shared_with_lodge", true).order("occurred_on", { ascending: false }).limit(50);
    return (
      <Panel title="Mentoring activity" description="Contacts the Provincial team has chosen to share with the Lodge.">
        {contacts?.length
          ? <Timeline items={contacts.map((c) => ({ id: c.id, when: formatDate(c.occurred_on), title: label(c.method), body: c.summary, meta: c.outcome ?? undefined }))} />
          : <EmptyState title="Nothing shared yet">When your Assistant shares a contact with the Lodge, it appears here.</EmptyState>}
      </Panel>
    );
  }
}
