import type { Metadata } from "next";
import Link from "next/link";
import { Badge, mentoringStatusTone } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { ActionButton, DialogForm } from "@/components/ui/dialog-form";
import { TextField } from "@/components/ui/form";
import { formatDate, relativeDays } from "@/lib/utils";
import { getDataset } from "@/server/reports/datasets";
import "@/server/reports/register";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { deleteSavedView, saveLodgeView } from "./actions";

export const metadata: Metadata = { title: "Lodges" };

type Search = { q?: string; area?: string; status?: string; lm?: string; allocation?: string; mine?: string };

export default async function LodgesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("lodges.read");
  const sp = await searchParams;
  const db = await supabaseServer();
  const filters: Record<string, string> = { ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), person: session.personId };
  const [rows, { data: areas }, { data: statuses }, { data: views }] = await Promise.all([
    getDataset("lodges")!.query(db, filters),
    db.from("areas").select("id, name").order("code"),
    db.from("mentoring_statuses").select("key, label").eq("active", true).order("position"),
    db.from("saved_views").select("id, name, filters").eq("page", "lodges").order("created_at"),
  ]);
  const query = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const isAllocated = session.allocatedLodgeIds.length > 0;

  return (
    <>
      <PageHeader
        title="Lodges"
        description="Ordinary Lodge information across the Province. Detailed mentoring records follow your allocations."
        actions={
          <>
            {can(session, "allocations.manage") && <LinkButton href="/allocations">Allocations</LinkButton>}
            {can(session, "lodges.export") && (
              <details className="relative">
                <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-md border border-line bg-white px-4 font-medium text-navy-800 hover:border-navy-600">Export</summary>
                <div className="absolute right-0 z-30 mt-1 w-44 rounded-md border border-line bg-white py-1 shadow-lg">
                  {(["csv", "xlsx", "pdf"] as const).map((f) => (
                    <a key={f} href={`/api/export/lodges?${query}${query ? "&" : ""}format=${f}`} className="block px-4 py-2 text-sm hover:bg-navy-50">{{ csv: "CSV", xlsx: "Excel", pdf: "PDF" }[f]}</a>
                  ))}
                </div>
              </details>
            )}
          </>
        }
      />

      {(views?.length || isAllocated) ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Views:</span>
          <Link href="/lodges" className="rounded-full border border-line bg-white px-3 py-1 hover:border-navy-600">All Lodges</Link>
          {isAllocated && <Link href="/lodges?mine=1" className="rounded-full border border-line bg-white px-3 py-1 hover:border-navy-600">My Lodges</Link>}
          {views?.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-white pl-3 pr-1">
              <Link href={`/lodges?${new URLSearchParams(v.filters as Record<string, string>)}`} className="py-1 hover:underline">{v.name}</Link>
              <ActionButton action={deleteSavedView} fields={{ view_id: v.id }} variant="subtle" confirm={`Remove the saved view "${v.name}"?`}>
                <span aria-label={`Remove ${v.name}`}>×</span>
              </ActionButton>
            </span>
          ))}
        </div>
      ) : null}

      <FilterBar resetHref="/lodges">
        <FilterSearch defaultValue={sp.q} placeholder="Name or number" />
        <FilterSelect name="area" label="Area" defaultValue={sp.area} options={(areas ?? []).map((a) => ({ value: a.id, label: a.name }))} />
        <FilterSelect name="status" label="Mentoring status" defaultValue={sp.status} options={(statuses ?? []).map((s) => ({ value: s.key, label: s.label }))} />
        <FilterSelect name="lm" label="Lodge Mentor" defaultValue={sp.lm} options={[{ value: "vacant", label: "Vacant" }, { value: "unconfirmed", label: "Unconfirmed" }]} />
        <FilterSelect name="allocation" label="Allocation" defaultValue={sp.allocation} options={[{ value: "unallocated", label: "Unallocated" }]} />
        {sp.mine && <input type="hidden" name="mine" value="1" />}
      </FilterBar>

      <div className="mb-3 flex items-center justify-between text-sm text-muted">
        <span>{rows.length} {rows.length === 1 ? "Lodge" : "Lodges"}</span>
        {query && (
          <DialogForm trigger="Save this view" triggerVariant="subtle" triggerSize="sm" title="Save view" action={saveLodgeView} submitLabel="Save view">
            <input type="hidden" name="filters" value={JSON.stringify(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)))} />
            <TextField label="Name" name="name" required placeholder="e.g. Unconfirmed Lodge Mentors, North" />
          </DialogForm>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No Lodges match these filters"><Link href="/lodges" className="underline">Clear the filters</Link> to see every Lodge.</EmptyState>
      ) : (
        <Table caption="Lodges">
          <THead>
            <TH>No.</TH><TH>Lodge</TH><TH className="hidden md:table-cell">Area · Assistant</TH><TH>Lodge Mentor</TH>
            <TH>Status</TH><TH className="hidden lg:table-cell">Last contact</TH><TH className="hidden lg:table-cell">Next review</TH>
          </THead>
          <TBody>
            {rows.map((l) => {
              const r = l as Record<string, string | number | boolean | null>;
              const overdue = r.next_review_on && String(r.next_review_on) < new Date().toISOString().slice(0, 10);
              return (
                <TR key={String(r.id)}>
                  <TD className="tabular-nums text-muted">{r.number}</TD>
                  <TD>
                    <RowLink href={`/lodges/${r.id}`}>{r.name}</RowLink>
                    <div className="text-[13px] text-muted">{r.meeting_centre}</div>
                  </TD>
                  <TD className="hidden md:table-cell">
                    {r.apgmen ? <>{r.area}<div className="text-[13px] text-muted">{r.apgmen}{r.cover_apgmen ? ` · cover: ${r.cover_apgmen}` : ""}</div></> : <Badge tone="warning">Unallocated</Badge>}
                  </TD>
                  <TD>
                    {r.lodge_mentor ? <>{r.lodge_mentor}{r.lodge_mentor_confirmed === false && <div><Badge tone="warning">Unconfirmed</Badge></div>}</> : <Badge tone="warning">Vacant</Badge>}
                  </TD>
                  <TD>{r.mentoring_status ? <Badge tone={mentoringStatusTone(String(r.mentoring_status_key))}>{r.mentoring_status}</Badge> : null}</TD>
                  <TD className="hidden lg:table-cell">{r.last_contact_on ? <span title={formatDate(String(r.last_contact_on))}>{relativeDays(String(r.last_contact_on))}</span> : <span className="text-muted">None recorded</span>}</TD>
                  <TD className="hidden lg:table-cell">{r.next_review_on ? <span className={overdue ? "font-medium text-warning-800" : ""}>{formatDate(String(r.next_review_on))}</span> : ""}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}
