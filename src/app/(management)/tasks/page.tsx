import type { Metadata } from "next";
import Link from "next/link";
import { Badge, statusTone } from "@/components/ui/badge";
import { FilterBar, FilterDate, FilterSearch, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader, Tabs } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { ExportMenu } from "@/components/members/export-menu";
import { MarkDoneButton, QuickAddTask } from "@/components/tasks/task-forms";
import { formatDate, label } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { linkedHref, OPEN_TASK, queryTasks, TASK_STATUSES, type TaskFilters } from "@/server/tasks/query";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<TaskFilters> }) {
  const session = await requirePermission("tasks.use");
  const sp = await searchParams;
  const db = await supabaseServer();
  const views = [
    { key: "mine", label: "My tasks" }, { key: "overdue", label: "Overdue" }, { key: "created", label: "Created by me" },
    ...(can(session, "tasks.manage_all") ? [{ key: "all", label: "All" }] : []),
  ];
  const view = views.some((v) => v.key === sp.view) ? sp.view! : "mine";
  const today = new Date().toISOString().slice(0, 10);

  const [rows, { data: lodges }, { count: overdueCount }] = await Promise.all([
    queryTasks(db, { ...sp, view }, { accountId: session.accountId }),
    db.from("lodges").select("id, name, number").order("number"),
    db.from("tasks").select("id", { count: "exact", head: true }).eq("owner_account_id", session.accountId).lt("due_on", today).in("status", OPEN_TASK),
  ]);
  const lodgeOptions = (lodges ?? []).map((l) => ({ value: l.id, label: `${l.number} ${l.name}` }));
  const exportQuery = new URLSearchParams(Object.fromEntries(Object.entries({ ...sp, view }).filter(([, v]) => v)) as Record<string, string>).toString();
  const filtered = !!(sp.status || sp.priority || sp.from || sp.to || sp.lodge || sp.q);

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Everything that needs doing, in one place. Actions from support requests and meetings appear here too."
        actions={can(session, "reports.export") ? <ExportMenu dataset="tasks" query={exportQuery} /> : undefined}
      />
      {(overdueCount ?? 0) > 0 && view !== "overdue" && (
        <p className="mb-4 rounded-md border border-warning-800/20 bg-warning-50 px-4 py-2.5 text-sm text-warning-800">
          You have {overdueCount} overdue {overdueCount === 1 ? "task" : "tasks"}. <Link href="/tasks?view=overdue" className="font-medium underline">See overdue</Link>
        </p>
      )}
      <div className="mb-6"><QuickAddTask lodges={lodgeOptions} /></div>
      <Tabs tabs={views.map((v) => ({ ...v, href: `/tasks?view=${v.key}` }))} current={view} />

      <FilterBar resetHref={`/tasks?view=${view}`}>
        <input type="hidden" name="view" value={view} />
        <FilterSearch defaultValue={sp.q} placeholder="Task title" />
        <FilterSelect name="status" label="Status" defaultValue={sp.status} placeholder="Open"
          options={[...TASK_STATUSES.map((s) => ({ value: s, label: label(s) })), { value: "any", label: "Any status" }]} />
        <FilterSelect name="priority" label="Priority" defaultValue={sp.priority} options={[{ value: "high", label: "High" }, { value: "normal", label: "Normal" }, { value: "low", label: "Low" }]} />
        <FilterDate name="from" label="Due from" defaultValue={sp.from} />
        <FilterDate name="to" label="Due to" defaultValue={sp.to} />
        <FilterSelect name="lodge" label="Lodge" defaultValue={sp.lodge} options={lodgeOptions} />
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState title={view === "overdue" ? "Nothing overdue" : view === "mine" && !filtered ? "No open tasks. Well done." : "No tasks match"}>
          {filtered ? <Link href={`/tasks?view=${view}`} className="underline">Clear the filters</Link> : "Done and cancelled tasks are hidden unless you choose a status."}
        </EmptyState>
      ) : (
        <Table caption="Tasks">
          <THead>
            <TH>Task</TH><TH className="hidden md:table-cell">Owner</TH><TH className="hidden lg:table-cell">Linked to</TH>
            <TH>Due</TH><TH className="hidden sm:table-cell">Status</TH><TH><span className="sr-only">Actions</span></TH>
          </THead>
          <TBody>
            {rows.map((t) => {
              const href = linkedHref(t.linked_type, t.linked_id);
              return (
                <TR key={t.id} className={t.overdue ? "bg-warning-50/40" : undefined}>
                  <TD>
                    <RowLink href={`/tasks/${t.id}`}>{t.title}</RowLink>
                    {t.priority === "high" && <> <Badge tone="warning">High</Badge></>}
                    {t.lodge_label && <div className="text-[13px] text-muted">{t.lodge_label}</div>}
                  </TD>
                  <TD className="hidden md:table-cell">{t.owner_name ?? <span className="text-muted">Unassigned</span>}</TD>
                  <TD className="hidden lg:table-cell">{t.linked_type ? (href ? <Link href={href} className="text-navy-800 underline">{label(t.linked_type)}</Link> : label(t.linked_type)) : <span className="text-muted">None</span>}</TD>
                  <TD className="whitespace-nowrap">{t.overdue ? <span className="font-medium text-warning-800">Overdue · {formatDate(t.due_on)}</span> : formatDate(t.due_on) || <span className="text-muted">No date</span>}</TD>
                  <TD className="hidden sm:table-cell"><Badge tone={statusTone(t.status)}>{label(t.status)}</Badge></TD>
                  <TD>{OPEN_TASK.includes(t.status) && <MarkDoneButton taskId={t.id} />}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      {rows.length >= 500 && <p className="mt-3 text-sm text-muted">Showing the first 500 tasks. Use the filters to narrow the list.</p>}
    </>
  );
}
