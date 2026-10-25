import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, statusTone } from "@/components/ui/badge";
import { Alert, DescriptionList, EmptyState, PageHeader, Panel, Timeline } from "@/components/ui/layout";
import {
  ActionTaskForm, CloseForm, CommentForm, EscalateForm, GrantAccessForm, ReopenForm, RestrictedNoteForm, TriageForm, UpdateCaseForm,
} from "@/components/support/support-forms";
import { formatDate, formatDateTime, label } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { OPEN_EXCLUDES } from "@/server/support/query";

export const metadata: Metadata = { title: "Support request" };

const FLOW = ["new", "assigned", "in_progress", "awaiting_response", "escalated", "resolved", "closed"];
type Named = { display_name: string } | null;
const accName = (a: unknown) => (a as { persons: Named } | null)?.persons?.display_name ?? null;

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; submitted?: string }> }) {
  const session = await requirePermission("cases.read.all", "cases.read.allocated", "cases.confidential.triage", "cases.confidential.submit");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const db = await supabaseServer();

  const { data: c } = await db.from("cases").select(`*, lodges(name, number),
    member:persons!cases_member_person_id_fkey(id, display_name), requester:persons!cases_requester_person_id_fkey(display_name),
    owner:user_accounts!cases_owner_account_id_fkey(persons(display_name)),
    escalated:user_accounts!cases_escalated_to_account_id_fkey(persons(display_name))`).eq("id", id).maybeSingle();
  if (!c) notFound();

  const confidential = c.kind === "confidential";
  const { data: myGrants } = await db.from("access_grants").select("id").eq("entity_type", "case").eq("entity_id", id).eq("account_id", session.accountId).is("revoked_at", null);
  const granted = (myGrants ?? []).length > 0;
  const onLodge = !!c.lodge_id && session.allocatedLodgeIds.includes(c.lodge_id);
  const triage = can(session, "cases.confidential.triage");
  const writeRole = can(session, "cases.write.all") || can(session, "cases.write.allocated");
  // Mirrors app.can_manage_case / app.can_read_case for showing controls; the database enforces them.
  const canManage = (c.owner_account_id === session.accountId && (writeRole || triage))
    || (granted && writeRole)
    || (confidential && triage)
    || (!confidential && (can(session, "cases.write.all") || (can(session, "cases.write.allocated") && onLodge)));
  const canReadFull = canManage || c.owner_account_id === session.accountId || c.escalated_to_account_id === session.accountId || granted
    || (confidential && triage) || (!confidential && (can(session, "cases.read.all") || (can(session, "cases.read.allocated") && onLodge)));
  const isOpen = !OPEN_EXCLUDES.includes(c.status);

  if (confidential && canReadFull) await db.rpc("log_sensitive_access", { p_entity_type: "case", p_entity_id: id });

  const [{ data: events }, { data: tasks }, { data: restricted }, { data: grants }, { data: cats }] = await Promise.all([
    db.from("case_events").select("id, kind, body, data, visible_to_requester, created_at, created_by, author:user_accounts!case_events_created_by_fkey(persons(display_name))").eq("case_id", id).order("created_at"),
    canReadFull ? db.from("tasks").select("id, title, status, due_on, owner:user_accounts!tasks_owner_account_id_fkey(persons(display_name))").eq("linked_type", "case").eq("linked_id", id).order("created_at") : Promise.resolve({ data: [] }),
    canReadFull ? db.from("notes").select("id, body, created_at, user_accounts!notes_author_account_id_fkey(persons(display_name))").eq("subject_type", "case").eq("subject_id", id).eq("visibility", "restricted").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    confidential && triage ? db.from("access_grants").select("id, reason, created_at, revoked_at, account:user_accounts!access_grants_account_id_fkey(persons(display_name))").eq("entity_type", "case").eq("entity_id", id).order("created_at") : Promise.resolve({ data: [] }),
    db.from("support_categories").select("key, label").order("position"),
  ]);

  // Names for assignment events (account ids in event data).
  const ids = [...new Set((events ?? []).flatMap((e) => { const d = e.data as Record<string, string | null>; return [d.from, d.to, d.owner, d.granted_to].filter((v): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v)); }))];
  const { data: accounts } = ids.length ? await db.from("user_accounts").select("id, persons(display_name)").in("id", ids) : { data: [] };
  const who = (aid?: string | null) => (aid ? accName((accounts ?? []).find((a) => a.id === aid)) ?? "a team member" : "nobody");
  const catLabel = (cats ?? []).find((x) => x.key === c.category_key)?.label ?? label(c.category_key);
  const lodge = c.lodges as unknown as { name: string; number: number } | null;
  const member = c.member as unknown as { id: string; display_name: string } | null;
  const overdue = !!c.due_on && isOpen && c.due_on < new Date().toISOString().slice(0, 10);

  const describe = (e: NonNullable<typeof events>[number]) => {
    const d = e.data as Record<string, string | null>;
    switch (e.kind) {
      case "status_change": return `Status: ${label(d.from)} to ${label(d.to)}`;
      case "assignment": return d.action === "assign" ? `Assigned at triage to ${who(d.owner)}` : `Owner: ${who(d.from)} to ${who(d.to)}`;
      case "escalation": return `Escalated to ${who(d.to)}`;
      case "referral": return `Referred to ${d.referred_to ?? "another procedure"}`;
      case "action": return "Action added";
      case "outcome": return "Outcome recorded";
      case "access": return `Access granted to ${who(d.granted_to)}`;
      default: return "Update";
    }
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/support", label: "Support" }]}
        title={c.title}
        description={`${c.reference} · ${confidential ? "Confidential concern" : catLabel}`}
        meta={
          <>
            <Badge tone={statusTone(c.status)}>{label(c.status)}</Badge>
            {c.priority !== "normal" && <Badge tone={c.priority === "high" ? "warning" : "neutral"}>{label(c.priority)} priority</Badge>}
            {overdue && <Badge tone="warning">Overdue</Badge>}
            {confidential && <Badge tone="navy">Confidential</Badge>}
          </>
        }
        actions={canManage ? (
          <>
            {isOpen && <UpdateCaseForm c={c} categories={(cats ?? []).filter((x) => x.key !== "confidential").map((x) => ({ value: x.key, label: x.label }))} />}
            {isOpen && c.status !== "triage" && <EscalateForm caseId={id} confidential={confidential} />}
            {isOpen && c.status !== "triage" && <CloseForm caseId={id} />}
            {!isOpen && c.status !== "referred" && <ReopenForm caseId={id} />}
          </>
        ) : undefined}
      />

      {sp.created && <div className="mb-4"><Alert tone="success">Request {c.reference} created{c.owner_account_id ? ` and routed to ${accName(c.owner)}` : ""}.</Alert></div>}
      {sp.submitted && <div className="mb-4"><Alert tone="success" title={`Thank you. Your concern ${c.reference} has been received.`}>Designated leadership have been told a concern has arrived. They will decide the next step.</Alert></div>}

      {!canReadFull ? (
        <RequesterView />
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            {confidential && c.status === "triage" && triage && (
              <Panel title="Triage" description="Assign with recorded access, refer through an existing authorised procedure and record where, or close.">
                <TriageForm caseId={id} />
              </Panel>
            )}
            <Panel title="Details">
              {c.description ? <p className="whitespace-pre-line text-sm">{c.description}</p> : <p className="text-sm text-muted">No further details recorded.</p>}
              {c.outcome && <div className="mt-4 rounded-md bg-canvas p-3 text-sm"><span className="font-medium">Outcome: </span>{c.outcome}</div>}
              {c.referred_to && <div className="mt-3 rounded-md bg-canvas p-3 text-sm"><span className="font-medium">Referred to: </span>{c.referred_to}</div>}
            </Panel>

            <Panel title="Updates" description={confidential ? undefined : "Updates are internal unless marked as visible to the person who raised the request."}>
              {events?.length ? (
                <Timeline items={events.map((e) => ({
                  id: e.id, when: formatDateTime(e.created_at),
                  title: <>{e.kind === "comment" ? (accName(e.author) ?? "Team member") : describe(e)}{e.visible_to_requester && <> <Badge tone="teal">Shared with requester</Badge></>}</>,
                  body: e.body ? <span className="whitespace-pre-line">{e.body}</span> : undefined,
                  meta: e.kind !== "comment" && accName(e.author) ? `by ${accName(e.author)}` : undefined,
                }))} />
              ) : <EmptyState title="No updates yet" />}
              {canManage && <div className="mt-5 border-t border-line pt-4"><CommentForm caseId={id} canShare={!!c.requester_account_id && c.requester_account_id !== session.accountId} /></div>}
            </Panel>

            {(can(session, "notes.restricted") || (restricted ?? []).length > 0) && (
              <Panel title="Restricted notes" description="Shown only here. Never in lists, Lodge pages, reports, search or notifications.">
                {restricted?.length ? (
                  <ul className="mb-4 divide-y divide-line">
                    {restricted.map((n) => (
                      <li key={n.id} className="py-3 first:pt-0 text-sm">
                        <div className="mb-1 text-[13px] text-muted">{accName(n.user_accounts) ?? "Team member"} · {formatDateTime(n.created_at)}</div>
                        <p className="whitespace-pre-line">{n.body}</p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mb-4 text-sm text-muted">No restricted notes.</p>}
                {can(session, "notes.restricted") && canManage && <RestrictedNoteForm caseId={id} />}
              </Panel>
            )}
          </div>

          <div className="space-y-6">
            <Panel title="Request">
              <DescriptionList columns={1} items={[
                { label: "Reference", value: c.reference },
                { label: "Category", value: confidential ? "Confidential concern" : catLabel },
                { label: "Raised by", value: (c.requester as unknown as Named)?.display_name },
                { label: "Raised", value: `${formatDate(c.created_at)} · ${label(c.source === "hub" ? "recorded in the Hub" : c.source)}` },
                { label: "Lodge", value: lodge ? (confidential ? `${lodge.name} No. ${lodge.number}` : <Link className="text-navy-800 underline" href={`/lodges/${c.lodge_id}`}>{lodge.name} No. {lodge.number}</Link>) : null },
                { label: "Brother concerned", value: member ? <Link className="text-navy-800 underline" href={`/members/${member.id}`}>{member.display_name}</Link> : null },
                { label: "Owner", value: accName(c.owner) ?? (c.status === "triage" ? "Awaiting triage" : "Unassigned") },
                ...(c.escalated_to_account_id ? [{ label: "Escalated to", value: accName(c.escalated) }] : []),
                { label: "Due", value: c.due_on ? <span className={overdue ? "font-medium text-warning-800" : ""}>{formatDate(c.due_on)}{overdue ? " (overdue)" : ""}</span> : null },
                ...(c.closed_at ? [{ label: "Closed", value: formatDate(c.closed_at) }] : []),
              ]} />
            </Panel>

            <Panel title="Progress">
              <ol className="space-y-1.5 text-sm">
                {(c.status === "referred" ? ["triage", "referred"] : confidential ? ["triage", ...FLOW.slice(1)] : FLOW).map((s) => (
                  <li key={s} className={s === c.status ? "font-semibold text-navy-900" : "text-muted"} aria-current={s === c.status ? "step" : undefined}>
                    {s === c.status ? "Now: " : ""}{label(s)}
                  </li>
                ))}
              </ol>
            </Panel>

            <Panel title="Actions" actions={canManage && isOpen ? <ActionTaskForm caseId={id} /> : undefined}>
              <ul className="space-y-2 text-sm">
                {(tasks ?? []).map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="font-medium text-navy-800 hover:underline">{t.title}</Link>
                    <span className="text-muted"> · {label(t.status)}{accName(t.owner) ? ` · ${accName(t.owner)}` : ""}{t.due_on ? ` · due ${formatDate(t.due_on)}` : ""}</span>
                  </li>
                ))}
                {!tasks?.length && <li className="text-muted">No actions yet.</li>}
              </ul>
            </Panel>

            {confidential && triage && (
              <Panel title="Access" actions={<GrantAccessForm caseId={id} />}>
                <ul className="space-y-2 text-sm">
                  {(grants ?? []).map((g) => (
                    <li key={g.id}>
                      <span className="font-medium">{accName(g.account) ?? "Team member"}</span>{g.revoked_at && <> <Badge>Revoked</Badge></>}
                      <div className="text-muted">{g.reason} · {formatDate(g.created_at)}</div>
                    </li>
                  ))}
                  {!grants?.length && <li className="text-muted">Only designated leadership can see this concern.</li>}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      )}
    </>
  );

  function RequesterView() {
    return (
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="What you told us">
            {c!.description ? <p className="whitespace-pre-line text-sm">{c!.description}</p> : <p className="text-sm text-muted">No further details recorded.</p>}
          </Panel>
          <Panel title="Updates for you">
            {events?.length ? (
              <Timeline items={events.map((e) => ({ id: e.id, when: formatDateTime(e.created_at), title: e.kind === "outcome" ? "Outcome" : "Update", body: e.body ?? undefined }))} />
            ) : <EmptyState title="No updates shared yet">{confidential ? "Leadership will be in touch if they need anything from you." : "The owner will share updates here."}</EmptyState>}
          </Panel>
        </div>
        <Panel title="Status">
          <DescriptionList columns={1} items={[
            { label: "Reference", value: c!.reference },
            { label: "Status", value: <Badge tone={statusTone(c!.status)}>{label(c!.status)}</Badge> },
            { label: "Raised", value: formatDate(c!.created_at) },
          ]} />
        </Panel>
      </div>
    );
  }
}
