import type { Metadata } from "next";
import Link from "next/link";
import { AllocateForm, CoverForm, EndAllocationForm, EndAppointmentForm, TransferWorkForm } from "@/components/admin/allocation-forms";
import { Badge } from "@/components/ui/badge";
import { FilterBar, FilterDate } from "@/components/ui/filters";
import { Alert, EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { activeManagementAccounts } from "@/server/admin/accounts";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { allocateLodge, endAllocation, endAppointment, transferWork } from "./actions";

export const metadata: Metadata = { title: "Allocations" };

const current = (starts: string, ends: string | null, at: string) => starts <= at && (!ends || ends >= at);
const name = (x: unknown) => (x as { display_name: string } | null)?.display_name ?? "";

export default async function AllocationsPage({ searchParams }: { searchParams: Promise<{ at?: string }> }) {
  await requirePermission("allocations.manage");
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const at = sp.at && /^\d{4}-\d{2}-\d{2}$/.test(sp.at) ? sp.at : today;
  const historic = at !== today;
  const db = await supabaseServer();

  const [{ data: areas }, { data: appts }, { data: allocations }, { data: lodges }, { data: accounts }, { data: tasks }, { data: cases }] = await Promise.all([
    db.from("areas").select("id, code, name").eq("active", true).order("code"),
    db.from("provincial_appointments").select("id, person_id, area_id, starts_on, ends_on, persons(display_name)").eq("office", "apgmen").order("starts_on"),
    db.from("lodge_allocations").select("id, lodge_id, person_id, area_id, kind, starts_on, ends_on, reason, persons(display_name)").order("starts_on"),
    db.from("lodges").select("id, number, name, status").order("number"),
    db.from("user_accounts").select("id, person_id, status"),
    db.from("tasks").select("owner_account_id, due_on").in("status", ["open", "in_progress", "waiting"]).not("owner_account_id", "is", null).limit(5000),
    db.from("cases").select("owner_account_id").eq("kind", "request").not("status", "in", "(closed,resolved,referred)").not("owner_account_id", "is", null).limit(5000),
  ]);

  const recipients = historic ? [] : await activeManagementAccounts(db);
  const lodgeById = new Map((lodges ?? []).map((l) => [l.id, l]));
  const accountOf = new Map((accounts ?? []).map((a) => [a.person_id, a.id]));
  const work = (accountId?: string) => {
    const t = (tasks ?? []).filter((x) => x.owner_account_id === accountId);
    return { tasks: t.length, overdue: t.filter((x) => x.due_on && x.due_on < today).length, requests: (cases ?? []).filter((c) => c.owner_account_id === accountId).length };
  };
  const activeAppts = (appts ?? []).filter((a) => current(a.starts_on, a.ends_on, at));
  const activeAllocs = (allocations ?? []).filter((a) => current(a.starts_on, a.ends_on, at));
  const assistantOptions = (appts ?? []).filter((a) => current(a.starts_on, a.ends_on, today))
    .map((a) => ({ value: a.person_id, label: `${name(a.persons)}${areas?.find((x) => x.id === a.area_id) ? ` (${areas.find((x) => x.id === a.area_id)!.name})` : ""}` }));
  const allocatedIds = new Set(activeAllocs.filter((a) => a.kind === "primary").map((a) => a.lodge_id));
  const unallocated = (lodges ?? []).filter((l) => !allocatedIds.has(l.id) && l.status === "active");
  const formerWithWork = (appts ?? []).filter((a) => a.ends_on && a.ends_on < today && !activeAppts.some((x) => x.person_id === a.person_id))
    .filter((a, i, arr) => arr.findIndex((x) => x.person_id === a.person_id) === i)
    .map((a) => ({ a, account: accountOf.get(a.person_id), w: work(accountOf.get(a.person_id)) }))
    .filter((x) => x.account && (x.w.tasks || x.w.requests));

  const lodgeLabel = (id: string) => { const l = lodgeById.get(id); return l ? `${l.name} No. ${l.number}` : "Lodge"; };

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/lodges", label: "Lodges" }]} title="Allocations"
        description="Which Assistant Provincial Grand Mentor looks after each Lodge. Changes take effect from the date you choose and the history is kept." />
      <FilterBar resetHref="/allocations">
        <FilterDate name="at" label="Show allocations as at" defaultValue={at} />
      </FilterBar>
      {historic && <div className="mb-5"><Alert tone="info" title={`Historic view: ${formatDate(at)}`}>This shows who held each Lodge on that date. Workloads and changes are only shown for today. <Link href="/allocations" className="underline">Return to today</Link></Alert></div>}

      {!historic && (
        <Panel title="Assistants and workloads" className="mb-6" padded={false}>
          {activeAppts.length ? (
            <Table className="rounded-none border-0" caption="Assistant workloads">
              <THead><TH>Assistant</TH><TH className="hidden md:table-cell">Area</TH><TH align="right">Lodges</TH><TH align="right">Open tasks</TH><TH align="right" className="hidden sm:table-cell">Open requests</TH><TH align="right" className="hidden sm:table-cell">Overdue</TH></THead>
              <TBody>
                {activeAppts.map((a) => {
                  const acc = accountOf.get(a.person_id);
                  const w = work(acc);
                  const lodgesHeld = activeAllocs.filter((x) => x.person_id === a.person_id && x.kind === "primary").length;
                  const covering = activeAllocs.filter((x) => x.person_id === a.person_id && x.kind === "cover").length;
                  return (
                    <TR key={a.id}>
                      <TD className="font-medium">{name(a.persons)}<div className="text-[13px] font-normal text-muted md:hidden">{areas?.find((x) => x.id === a.area_id)?.name}</div>
                        <div className="mt-2 flex flex-wrap gap-1 font-normal">
                          {acc && (w.tasks > 0 || w.requests > 0) && <TransferWorkForm action={transferWork} fromAccount={acc} name={name(a.persons)} accounts={recipients} trigger="Transfer work" />}
                          <EndAppointmentForm action={endAppointment} personId={a.person_id} name={name(a.persons)} lodges={lodgesHeld + covering} openTasks={w.tasks} openCases={w.requests} />
                        </div>
                      </TD>
                      <TD className="hidden md:table-cell">{areas?.find((x) => x.id === a.area_id)?.name ?? "No area"}</TD>
                      <TD align="right">{lodgesHeld}{covering ? <span className="text-muted"> +{covering} cover</span> : null}</TD>
                      <TD align="right">{w.tasks}</TD>
                      <TD align="right" className="hidden sm:table-cell">{w.requests}</TD>
                      <TD align="right" className="hidden sm:table-cell">{w.overdue ? <span className="font-medium text-warning-800">{w.overdue}</span> : 0}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          ) : <div className="p-5"><EmptyState title="No Assistants are appointed">Appointments are recorded against each person&apos;s Provincial office.</EmptyState></div>}
        </Panel>
      )}

      {formerWithWork.length > 0 && !historic && (
        <Panel title="Former Assistants with open work" className="mb-6">
          <ul className="space-y-3 text-sm">
            {formerWithWork.map(({ a, account, w }) => (
              <li key={a.person_id} className="flex flex-wrap items-center justify-between gap-3">
                <span><span className="font-medium">{name(a.persons)}</span> <span className="text-muted">· appointment ended {formatDate(a.ends_on)} · {w.tasks} open tasks, {w.requests} open requests</span></span>
                <TransferWorkForm action={transferWork} fromAccount={account!} name={name(a.persons)} accounts={recipients} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title={`Unallocated Lodges (${unallocated.length})`} className="mb-6" padded={false}>
        {unallocated.length ? (
          <ul className="divide-y divide-line">
            {unallocated.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <Link href={`/lodges/${l.id}`} className="font-medium text-navy-800 hover:underline">{l.name} No. {l.number}</Link>
                {!historic && <AllocateForm action={allocateLodge} lodgeId={l.id} lodgeName={`${l.name} No. ${l.number}`} assistants={assistantOptions} mode="allocate" />}
              </li>
            ))}
          </ul>
        ) : <p className="p-5 text-sm text-muted">Every active Lodge has an Assistant{historic ? " on this date" : ""}.</p>}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        {[...(areas ?? []), { id: null as string | null, code: "", name: "No area recorded" }].map((area) => {
          const rows = activeAllocs.filter((x) => x.kind === "primary" && (x.area_id ?? null) === area.id)
            .sort((x, y) => (lodgeById.get(x.lodge_id)?.number ?? 0) - (lodgeById.get(y.lodge_id)?.number ?? 0));
          if (!area.id && !rows.length) return null;
          const assistants = activeAppts.filter((a) => a.area_id === area.id).map((a) => name(a.persons)).join(", ");
          return (
            <Panel key={area.id ?? "none"} title={area.name} description={assistants ? `Assistant: ${assistants}` : area.id ? "No Assistant appointed" : undefined} padded={false}>
              {rows.length ? (
                <Table className="rounded-none border-0" caption={`Lodges in ${area.name}`}>
                  <THead><TH>Lodge</TH><TH className="hidden sm:table-cell">Assistant</TH><TH className="hidden md:table-cell">Since</TH><TH><span className="sr-only">Actions</span></TH></THead>
                  <TBody>
                    {rows.map((al) => {
                      const cover = activeAllocs.find((c) => c.kind === "cover" && c.lodge_id === al.lodge_id);
                      return (
                        <TR key={al.id}>
                          <TD>
                            <Link href={`/lodges/${al.lodge_id}`} className="font-medium text-navy-800 hover:underline">{lodgeLabel(al.lodge_id)}</Link>
                            <div className="text-[13px] text-muted sm:hidden">{name(al.persons)}</div>
                            {cover && <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px]"><Badge tone="teal">Cover</Badge> {name(cover.persons)} until {formatDate(cover.ends_on)}
                              {!historic && <EndAllocationForm action={endAllocation} allocationId={cover.id} lodgeId={al.lodge_id} label="this cover" />}</div>}
                          </TD>
                          <TD className="hidden sm:table-cell">{name(al.persons)}</TD>
                          <TD className="hidden md:table-cell">{formatDate(al.starts_on)}</TD>
                          <TD>
                            {!historic && (
                              <div className="flex flex-wrap justify-end gap-1">
                                <AllocateForm action={allocateLodge} lodgeId={al.lodge_id} lodgeName={lodgeLabel(al.lodge_id)} assistants={assistantOptions.filter((o) => o.value !== al.person_id)} mode="reallocate" />
                                {!cover && <CoverForm action={allocateLodge} lodgeId={al.lodge_id} lodgeName={lodgeLabel(al.lodge_id)} assistants={assistantOptions.filter((o) => o.value !== al.person_id)} />}
                                <EndAllocationForm action={endAllocation} allocationId={al.id} lodgeId={al.lodge_id} label={`the allocation of ${lodgeLabel(al.lodge_id)}`} />
                              </div>
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              ) : <p className="p-5 text-sm text-muted">No Lodges allocated in this area{historic ? " on this date" : ""}.</p>}
            </Panel>
          );
        })}
      </div>
    </>
  );
}
