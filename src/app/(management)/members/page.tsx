import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, FilterDate, FilterSearch, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { Pagination, RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { ExportMenu } from "@/components/members/export-menu";
import { progressionPrompt } from "@/lib/progression";
import { formatDate, label } from "@/lib/utils";
import { PAGE_SIZE, progressionSettings, queryMembers, STAGES, type MemberFilters } from "@/server/members/directory";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Members" };

type Search = MemberFilters & { page?: string };

export default async function MembersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("members.read.basic");
  const sp = await searchParams;
  const db = await supabaseServer();
  const page = Math.max(1, Number(sp.page) || 1);
  const settings = progressionSettings(session.org.settings);
  const detailRole = can(session, "members.read.detail.all") || can(session, "members.read.detail.allocated");

  const [{ rows, total }, { data: lodges }, { data: areas }] = await Promise.all([
    queryMembers(db, sp, { settings, page }),
    db.from("lodges").select("id, name, number").order("number"),
    db.from("areas").select("id, name").order("code"),
  ]);
  const filters = Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "page")) as Record<string, string>;
  const query = new URLSearchParams(filters).toString();
  const href = (p: number) => `/members?${new URLSearchParams({ ...filters, page: String(p) })}`;
  const anyDetail = rows.some((m) => m.stage);

  return (
    <>
      <PageHeader
        title="Members"
        description="Hermes and Adelphi remain the membership record. The Hub keeps only what mentoring needs."
        actions={can(session, "members.export") ? <ExportMenu dataset="members" query={query} /> : undefined}
      />

      <FilterBar resetHref="/members">
        <FilterSearch defaultValue={sp.q} placeholder="Name or membership number" />
        <FilterSelect name="lodge" label="Lodge" defaultValue={sp.lodge} options={(lodges ?? []).map((l) => ({ value: l.id, label: `${l.number} ${l.name}` }))} />
        <FilterSelect name="area" label="Area" defaultValue={sp.area} options={(areas ?? []).map((a) => ({ value: a.id, label: a.name }))} />
        {detailRole && (
          <>
            <FilterSelect name="stage" label="Stage" defaultValue={sp.stage} options={STAGES.map((s) => ({ value: s, label: label(s) }))} />
            <FilterSelect name="pm" label="Personal Mentor" defaultValue={sp.pm} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unknown", label: "Unknown" }]} />
            <FilterSelect name="prompt" label="Conversation" defaultValue={sp.prompt} placeholder="Any" options={[{ value: "1", label: "May welcome a conversation" }]} />
          </>
        )}
        <FilterDate name="from" label="Initiated from" defaultValue={sp.from} />
        <FilterDate name="to" label="Initiated to" defaultValue={sp.to} />
        <FilterSelect name="status" label="Membership" defaultValue={sp.status} placeholder="Current members" options={[{ value: "former", label: "Former members" }, { value: "all", label: "Everyone" }]} />
      </FilterBar>

      {detailRole && !can(session, "members.read.detail.all") && (
        <p className="mb-3 text-sm text-muted">Mentoring journeys are shown for members of Lodges allocated to you. Others show basic membership information only.</p>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No members match these filters"><Link href="/members" className="underline">Clear the filters</Link> to see everyone.</EmptyState>
      ) : (
        <>
          <Table caption="Members">
            <THead>
              <TH>Name</TH><TH className="hidden sm:table-cell">Lodge</TH><TH className="hidden md:table-cell">Initiated</TH>
              <TH className="hidden lg:table-cell">Passed</TH><TH className="hidden lg:table-cell">Raised</TH>
              {anyDetail && <><TH>Stage</TH><TH className="hidden md:table-cell">Personal Mentor</TH><TH className="hidden xl:table-cell">Prompt</TH></>}
            </THead>
            <TBody>
              {rows.map((m) => {
                const prompt = m.stage ? progressionPrompt(m, settings) : null;
                return (
                  <TR key={m.id}>
                    <TD>
                      <RowLink href={`/members/${m.id}`}>{m.display_name}</RowLink>
                      <div className="text-[13px] text-muted">
                        {m.membership_number ? `No. ${m.membership_number}` : "No membership number"}
                        {m.status !== "active" && ` · ${label(m.status)}`}
                      </div>
                    </TD>
                    <TD className="hidden sm:table-cell">{m.lodge_name ? `${m.lodge_name} No. ${m.lodge_number}` : <span className="text-muted">None recorded</span>}</TD>
                    <TD className="hidden md:table-cell">{formatDate(m.initiated_on)}</TD>
                    <TD className="hidden lg:table-cell">{formatDate(m.passed_on)}</TD>
                    <TD className="hidden lg:table-cell">{formatDate(m.raised_on)}</TD>
                    {anyDetail && <>
                      <TD>{m.stage ? label(m.stage) : <span className="text-muted">Not shown</span>}</TD>
                      <TD className="hidden md:table-cell">{m.personal_mentor_allocated ? label(m.personal_mentor_allocated) : ""}</TD>
                      <TD className="hidden max-w-xs text-[13px] text-slate-ink xl:table-cell">{prompt}</TD>
                    </>}
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={href} />
        </>
      )}
    </>
  );
}
