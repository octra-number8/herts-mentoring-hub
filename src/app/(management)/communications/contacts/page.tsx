import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { isoInDays, label } from "@/lib/utils";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Contacts" };

const GROUPS = [
  { value: "lodge_mentors", label: "Lodge Mentors" },
  { value: "personal_mentors", label: "Personal Mentors" },
  { value: "newer", label: "Newer Brethren (initiated in the last two years)" },
  { value: "secretaries", label: "Lodge Secretaries" },
  { value: "provincial", label: "Provincial team" },
];
const PROVINCIAL: Record<string, string> = {
  prov_grand_mentor: "Provincial Grand Mentor", deputy_prov_grand_mentor: "Deputy Provincial Grand Mentor", apgmen: "Assistant Provincial Grand Mentor", prov_team: "Provincial team",
};

type Search = { group?: string; lodge?: string; area?: string; q?: string; email?: string };
type Entry = { roles: string[]; lodges: Set<string> };

/** People the sender may want to contact. Everything is read as the user, so RLS decides who appears. */
export default async function ContactsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("comms.use");
  const sp = await searchParams;
  const db = await supabaseServer();
  const today = new Date().toISOString().slice(0, 10);
  const want = (g: string) => !sp.group || sp.group === g;

  const { data: lodges } = await db.from("v_lodge_overview").select("id, name, number, area_id, area").order("number");
  const lodgeName = new Map((lodges ?? []).map((l) => [l.id!, `${l.name} No. ${l.number}`]));
  const areaOf = new Map((lodges ?? []).map((l) => [l.id!, l.area_id]));
  const areas = [...new Map((lodges ?? []).filter((l) => l.area_id).map((l) => [l.area_id!, l.area!])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const lodgeOk = (id: string | null) => (!sp.lodge || id === sp.lodge) && (!sp.area || (id && areaOf.get(id) === sp.area));

  const people = new Map<string, Entry>();
  const add = (pid: string | null, role: string, lodge: string | null) => {
    if (!pid) return;
    const e = people.get(pid) ?? { roles: [], lodges: new Set<string>() };
    e.roles.push(role);
    if (lodge) e.lodges.add(lodge);
    people.set(pid, e);
  };

  const offices = [...(want("lodge_mentors") ? ["lodge_mentor", "assistant_lodge_mentor"] : []), ...(want("secretaries") ? ["secretary"] : [])];
  const [{ data: appts }, { data: journeys }, { data: newer }, { data: prov }] = await Promise.all([
    offices.length ? db.from("lodge_appointments").select("person_id, office, lodge_id, starts_on, ends_on").in("office", offices).lte("starts_on", today).not("person_id", "is", null) : Promise.resolve({ data: [] as never[] }),
    want("personal_mentors") ? db.from("member_journeys").select("personal_mentor_person_id, person_id").not("personal_mentor_person_id", "is", null).limit(2000) : Promise.resolve({ data: [] as never[] }),
    want("newer") ? db.from("v_member_overview").select("id, lodge_id, initiated_on").eq("status", "active").gte("initiated_on", isoInDays(-730)).limit(2000) : Promise.resolve({ data: [] as never[] }),
    want("provincial") && !sp.lodge ? db.from("provincial_appointments").select("person_id, office, area_id, starts_on, ends_on").lte("starts_on", today) : Promise.resolve({ data: [] as never[] }),
  ]);
  for (const a of appts ?? []) if ((!a.ends_on || a.ends_on >= today) && lodgeOk(a.lodge_id)) add(a.person_id, `${label(a.office)}, ${lodgeName.get(a.lodge_id) ?? "Lodge"}`, a.lodge_id);
  if (journeys?.length) {
    const { data: memberships } = await db.from("lodge_memberships").select("person_id, lodge_id").in("person_id", [...new Set(journeys.map((j) => j.person_id))]).is("left_on", null);
    const lodgeOfMember = new Map((memberships ?? []).map((m) => [m.person_id, m.lodge_id]));
    for (const j of journeys) {
      const l = lodgeOfMember.get(j.person_id) ?? null;
      if (lodgeOk(l)) add(j.personal_mentor_person_id, `Personal Mentor${l ? `, ${lodgeName.get(l) ?? "Lodge"}` : ""}`, l);
    }
  }
  for (const m of newer ?? []) if (lodgeOk(m.lodge_id)) add(m.id, `Newer Brother${m.lodge_id ? `, ${lodgeName.get(m.lodge_id) ?? "Lodge"}` : ""}`, m.lodge_id);
  for (const p of prov ?? []) if ((!p.ends_on || p.ends_on >= today) && (!sp.area || p.area_id === sp.area)) add(p.person_id, PROVINCIAL[p.office] ?? label(p.office), null);

  const ids = [...people.keys()];
  const [{ data: persons }, { data: prefs }] = ids.length
    ? await Promise.all([
      db.from("persons").select("id, display_name, last_name, email, status").in("id", ids.slice(0, 1000)),
      db.from("comm_preferences").select("person_id, learning, events, news, unsubscribed_all_at, email_status").in("person_id", ids.slice(0, 1000)),
    ])
    : [{ data: [] as { id: string; display_name: string | null; last_name: string; email: string | null; status: string }[] }, { data: [] as never[] }];
  const prefOf = new Map((prefs ?? []).map((p) => [p.person_id, p]));
  const q = sp.q?.toLowerCase().trim();
  let rows = (persons ?? []).filter((p) => p.status === "active" && (!q || (p.display_name ?? "").toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q)));
  if (sp.email === "problem") rows = rows.filter((p) => !p.email || ["bounced", "complained", "invalid"].includes(prefOf.get(p.id)?.email_status ?? ""));
  if (sp.email === "unsubscribed") rows = rows.filter((p) => prefOf.get(p.id)?.unsubscribed_all_at);
  rows.sort((a, b) => a.last_name.localeCompare(b.last_name));

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/communications", label: "Communications" }]} title="Contacts"
        description="Lodge Mentors, Personal Mentors, newer Brethren, Lodge Secretaries and the Provincial team, with their email preferences. You see the people your role allows." />
      <FilterBar resetHref="/communications/contacts">
        <FilterSearch defaultValue={sp.q} placeholder="Name or email" />
        <FilterSelect name="group" label="Group" defaultValue={sp.group} options={GROUPS} placeholder="All groups" />
        <FilterSelect name="lodge" label="Lodge" defaultValue={sp.lodge} options={(lodges ?? []).map((l) => ({ value: l.id!, label: `${l.number} ${l.name}` }))} />
        <FilterSelect name="area" label="Area" defaultValue={sp.area} options={areas.map(([value, l]) => ({ value, label: l }))} />
        <FilterSelect name="email" label="Email" defaultValue={sp.email} placeholder="Any" options={[{ value: "problem", label: "Missing or undeliverable" }, { value: "unsubscribed", label: "Unsubscribed" }]} />
      </FilterBar>
      <p className="mb-3 text-sm text-muted">{rows.length} {rows.length === 1 ? "person" : "people"}. To write to a group, <Link href="/communications" className="underline">create a campaign</Link>.</p>
      {rows.length === 0 ? <EmptyState title="Nobody matches these filters"><Link href="/communications/contacts" className="underline">Clear the filters</Link></EmptyState> : (
        <Table caption="Contacts">
          <THead><TH>Name</TH><TH className="hidden md:table-cell">Role</TH><TH>Email</TH><TH className="hidden lg:table-cell">Email preferences</TH></THead>
          <TBody>
            {rows.map((p) => {
              const pref = prefOf.get(p.id);
              const bad = pref && ["bounced", "complained", "invalid"].includes(pref.email_status);
              return (
                <TR key={p.id}>
                  <TD className="font-medium">{p.display_name}<div className="text-[13px] font-normal text-muted md:hidden">{people.get(p.id)!.roles[0]}</div></TD>
                  <TD className="hidden md:table-cell"><ul className="space-y-0.5 text-[13px]">{[...new Set(people.get(p.id)!.roles)].slice(0, 4).map((r) => <li key={r}>{r}</li>)}</ul></TD>
                  <TD className="break-all">
                    {p.email ? <a href={`mailto:${p.email}`} className="text-navy-800 underline">{p.email}</a> : <span className="text-muted">No email address</span>}
                    {bad && <div><Badge tone="warning">{label(pref!.email_status)}</Badge></div>}
                  </TD>
                  <TD className="hidden lg:table-cell text-[13px]">
                    {pref ? (pref.unsubscribed_all_at ? "Unsubscribed from all but essential email"
                      : [pref.learning && "Learning", pref.events && "Events", pref.news && "News"].filter(Boolean).join(", ") || "Essential email only") : "Defaults (learning and events)"}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}
