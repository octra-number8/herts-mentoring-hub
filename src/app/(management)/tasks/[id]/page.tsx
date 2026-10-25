import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, statusTone } from "@/components/ui/badge";
import { DescriptionList, EmptyState, PageHeader, Panel, Timeline } from "@/components/ui/layout";
import { EditTaskForm, MarkDoneButton, ReassignForm, ReopenTaskButton, TaskCommentForm } from "@/components/tasks/task-forms";
import { formatDate, formatDateTime, label } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { linkedRecord } from "@/server/tasks/linked";
import { OPEN_TASK } from "@/server/tasks/query";

export const metadata: Metadata = { title: "Task" };

type Named = { persons: { display_name: string } | null } | null;
const nm = (a: unknown) => (a as Named)?.persons?.display_name ?? null;

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("tasks.use");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await supabaseServer();

  const { data: t } = await db.from("tasks").select(`*, lodges(name, number),
    owner:user_accounts!tasks_owner_account_id_fkey(persons(display_name)),
    creator:user_accounts!tasks_created_by_fkey(persons(display_name)),
    completer:user_accounts!tasks_completed_by_fkey(persons(display_name))`).eq("id", id).maybeSingle();
  if (!t) notFound();

  const canAudit = can(session, "admin.audit");
  const [linked, { data: comments }, { data: audit }] = await Promise.all([
    linkedRecord(db, t.linked_type, t.linked_id, t.lodge_id),
    db.from("task_comments").select("id, body, created_at, author:user_accounts!task_comments_created_by_fkey(persons(display_name))").eq("task_id", id).order("created_at"),
    canAudit ? db.from("audit_events").select("id, action, occurred_at, details, actor_account_id").eq("entity_type", "tasks").eq("entity_id", id).order("occurred_at") : Promise.resolve({ data: null }),
  ]);

  const actorIds = [...new Set((audit ?? []).map((a) => a.actor_account_id).filter((v): v is string => !!v))];
  const { data: actors } = actorIds.length ? await db.from("user_accounts").select("id, persons(display_name)").in("id", actorIds) : { data: [] };
  const actorName = (aid: string | null) => nm((actors ?? []).find((a) => a.id === aid));

  // Mirrors the update policy, for showing controls only.
  const canEdit = t.owner_account_id === session.accountId || t.created_by === session.accountId || can(session, "tasks.manage_all")
    || (!!t.lodge_id && (can(session, "activity.write.all") || (can(session, "activity.write.allocated") && session.allocatedLodgeIds.includes(t.lodge_id))));
  const open = OPEN_TASK.includes(t.status);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = open && !!t.due_on && t.due_on < today;
  const lodge = t.lodges as unknown as { name: string; number: number } | null;

  const auditTitle = (a: { action: string; details: unknown }) => {
    if (a.action === "insert") return "Created";
    if (a.action === "delete") return "Deleted";
    const changes = ((a.details as { changes?: Record<string, { from?: unknown; to?: unknown } | string> })?.changes) ?? {};
    return Object.entries(changes).filter(([k]) => !["completed_at", "completed_by", "reminder_sent_at"].includes(k)).map(([k, v]) => {
      if (typeof v === "string") return `${label(k)} changed`;
      if (k === "status") return `Status: ${label(String(v.from))} to ${label(String(v.to))}`;
      if (k === "owner_account_id") return "Owner changed";
      if (k === "due_on") return `Due date: ${formatDate(v.from as string) || "none"} to ${formatDate(v.to as string) || "none"}`;
      if (k === "priority") return `Priority: ${label(String(v.from))} to ${label(String(v.to))}`;
      return `${label(k)} changed`;
    }).join(" · ") || "Updated";
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/tasks", label: "Tasks" }]}
        title={t.title}
        meta={
          <>
            <Badge tone={statusTone(t.status)}>{label(t.status)}</Badge>
            {t.priority !== "normal" && <Badge tone={t.priority === "high" ? "warning" : "neutral"}>{label(t.priority)} priority</Badge>}
            {overdue && <Badge tone="warning">Overdue</Badge>}
          </>
        }
        actions={canEdit ? (
          <>
            {open ? <MarkDoneButton taskId={id} /> : <ReopenTaskButton taskId={id} />}
            <ReassignForm task={t} />
            <EditTaskForm task={t} />
          </>
        ) : undefined}
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Description">
            {t.description ? <p className="whitespace-pre-line text-sm">{t.description}</p> : <p className="text-sm text-muted">No description.</p>}
          </Panel>
          <Panel title="Comments">
            {comments?.length ? (
              <ul className="mb-4 divide-y divide-line">
                {comments.map((c) => (
                  <li key={c.id} className="py-3 first:pt-0 text-sm">
                    <div className="mb-1 text-[13px] text-muted"><span className="font-medium text-ink">{nm(c.author) ?? "Team member"}</span> · {formatDateTime(c.created_at)}</div>
                    <p className="whitespace-pre-line">{c.body}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="mb-4 text-sm text-muted">No comments yet.</p>}
            <TaskCommentForm taskId={id} />
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Details">
            <DescriptionList columns={1} items={[
              { label: "Owner", value: nm(t.owner) ?? "Unassigned" },
              { label: "Due", value: t.due_on ? <span className={overdue ? "font-medium text-warning-800" : ""}>{formatDate(t.due_on)}{overdue ? " (overdue)" : ""}</span> : null },
              { label: "Linked to", value: linked ? (linked.href ? <Link href={linked.href} className="text-navy-800 underline">{label(t.linked_type)}: {linked.label}</Link> : `${label(t.linked_type)}: ${linked.label}`) : "Nothing" },
              ...(lodge && t.linked_type !== "lodge" ? [{ label: "Lodge", value: <Link href={`/lodges/${t.lodge_id}`} className="text-navy-800 underline">{lodge.name} No. {lodge.number}</Link> }] : []),
            ]} />
          </Panel>
          <Panel title="History">
            {audit ? (
              audit.length ? (
                <Timeline items={audit.map((a) => ({ id: String(a.id), when: formatDateTime(a.occurred_at), title: auditTitle(a), meta: actorName(a.actor_account_id) ? `by ${actorName(a.actor_account_id)}` : undefined }))} />
              ) : <EmptyState title="No history recorded" />
            ) : (
              <ul className="space-y-2 text-sm">
                <li><span className="text-muted">Created</span> {formatDateTime(t.created_at)}{nm(t.creator) ? ` by ${nm(t.creator)}` : ""}</li>
                {t.completed_at && <li><span className="text-muted">Completed</span> {formatDateTime(t.completed_at)}{nm(t.completer) ? ` by ${nm(t.completer)}` : ""}</li>}
                <li><span className="text-muted">Last updated</span> {formatDateTime(t.updated_at)}</li>
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
