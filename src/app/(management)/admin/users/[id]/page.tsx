import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TransferWorkForm } from "@/components/admin/allocation-forms";
import { AddGrantForm, AddRoleForm, EndRoleForm, StatusForm } from "@/components/admin/user-forms";
import { Badge, statusTone } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/dialog-form";
import { Alert, DescriptionList, EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate, formatDateTime, label } from "@/lib/utils";
import { activeManagementAccounts, mfaFactors } from "@/server/admin/accounts";
import { can, requirePermission } from "@/server/session";
import { supabaseServer, supabaseService } from "@/server/supabase";
import { transferWork } from "../../../allocations/actions";
import { addGrant, addRole, changeStatus, endGrant, endRole, resendInvite, revokeInvite } from "../actions";

export const metadata: Metadata = { title: "Account" };

const isCurrent = (s: string, e: string | null, today: string) => s <= today && (!e || e >= today);
const nameOf = (x: unknown) => (x as { persons: { display_name: string } } | null)?.persons?.display_name ?? "";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("admin.users", "admin.roles");
  const { id } = await params;
  const db = await supabaseServer();
  const { data: account } = await db.from("user_accounts").select("*, persons(id, display_name, email, phone, membership_number)").eq("id", id).maybeSingle();
  if (!account) notFound();
  const person = account.persons as unknown as { id: string; display_name: string; email: string | null; phone: string | null; membership_number: string | null } | null;
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: assignments }, { data: grants }, { data: roles }, { data: permissions }, { data: invitations }, { count: openTasks }, { count: openCases }, mfa] = await Promise.all([
    db.from("role_assignments").select("id, starts_on, ends_on, reason, created_at, roles(key, name, is_management), granter:user_accounts!role_assignments_granted_by_fkey(persons(display_name))").eq("account_id", id).order("starts_on", { ascending: false }),
    db.from("permission_grants").select("id, permission_key, starts_on, ends_on, is_override, reason, granter:user_accounts!permission_grants_granted_by_fkey(persons(display_name))").eq("account_id", id).order("starts_on", { ascending: false }),
    db.from("roles").select("id, key, name, is_management").order("name"),
    db.from("permissions").select("key, description").order("key"),
    can(session, "admin.users") ? db.from("invitations").select("id, email, created_at, expires_at, accepted_at, revoked_at").eq("person_id", account.person_id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as never[] }),
    db.from("tasks").select("id", { count: "exact", head: true }).eq("owner_account_id", id).in("status", ["open", "in_progress", "waiting"]),
    db.from("cases").select("id", { count: "exact", head: true }).eq("owner_account_id", id).eq("kind", "request").not("status", "in", "(closed,resolved,referred)"),
    mfaFactors(supabaseService(), account.auth_user_id),
  ]);

  const self = account.id === session.accountId;
  const canUsers = can(session, "admin.users");
  const canRoles = can(session, "admin.roles");
  const canTransfer = can(session, "allocations.manage") || can(session, "tasks.manage_all");
  const portalNote = (assignments ?? []).some((a) => (a.roles as unknown as { key: string }).key === "lodge_mentor" && isCurrent(a.starts_on, a.ends_on, today));

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/admin", label: "Administration" }, { href: "/admin/users", label: "Users" }]}
        title={person?.display_name ?? "Restricted record"} description={person?.email ?? undefined}
        meta={<><Badge tone={statusTone(account.status)}>{label(account.status)}</Badge>{account.mfa_required && <Badge tone="navy">Two-step verification required</Badge>}</>}
        actions={canUsers && !self ? (
          <>
            {account.status === "active" && <StatusForm action={changeStatus} accountId={id} to="suspended" label="Suspend" />}
            {account.status === "suspended" && <StatusForm action={changeStatus} accountId={id} to="active" label="Reactivate" />}
            {account.status === "deactivated" && <StatusForm action={changeStatus} accountId={id} to="active" label="Reactivate" />}
            {account.status !== "deactivated" && account.status !== "invited" && <StatusForm action={changeStatus} accountId={id} to="deactivated" label="Deactivate" variant="danger" />}
          </>
        ) : undefined} />

      {self && <div className="mb-5"><Alert tone="info">This is your own account. Someone else must change its status or your roles.</Alert></div>}
      {account.status_reason && account.status !== "active" && <div className="mb-5"><Alert tone="warning" title={`${label(account.status)}`}>{account.status_reason}</Alert></div>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Roles" description="Hub roles decide what someone can do. They are separate from Masonic appointments." padded={false}
            actions={canRoles ? <AddRoleForm action={addRole} accountId={id} roles={roles ?? []} /> : undefined}>
            {assignments?.length ? (
              <Table className="rounded-none border-0" caption="Roles">
                <THead><TH>Role</TH><TH>From</TH><TH>Until</TH><TH className="hidden md:table-cell">Reason</TH><TH><span className="sr-only">Actions</span></TH></THead>
                <TBody>
                  {assignments.map((a) => {
                    const r = a.roles as unknown as { key: string; name: string; is_management: boolean };
                    const cur = isCurrent(a.starts_on, a.ends_on, today);
                    return (
                      <TR key={a.id} className={cur ? "" : "text-muted"}>
                        <TD className="font-medium">{r.name}{r.is_management && <div className="text-[13px] font-normal text-muted">Two-step verification</div>}</TD>
                        <TD>{formatDate(a.starts_on)}</TD>
                        <TD>{a.ends_on ? formatDate(a.ends_on) : "No end"}</TD>
                        <TD className="hidden text-[13px] md:table-cell">{a.reason}{nameOf(a.granter) && <div className="text-muted">by {nameOf(a.granter)}</div>}</TD>
                        <TD>{canRoles && cur && !a.ends_on && <EndRoleForm action={endRole} accountId={id} assignmentId={a.id} name={r.name} />}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            ) : <div className="p-5"><EmptyState title="No roles">This account cannot do anything until a role is added.</EmptyState></div>}
          </Panel>
          {portalNote && <Alert tone="info">The Lodge Mentor role gives Academy access. The Lodge Mentor portal opens only when it is activated in <Link href="/admin/features" className="underline">Feature activation</Link>.</Alert>}

          <Panel title="Individual permissions" description="Delegated access and recorded overrides. Each has a reason and, ideally, an expiry." padded={false}
            actions={canRoles ? <AddGrantForm action={addGrant} accountId={id} permissions={permissions ?? []} /> : undefined}>
            {grants?.length ? (
              <Table className="rounded-none border-0" caption="Individual permissions">
                <THead><TH>Permission</TH><TH>From</TH><TH>Until</TH><TH className="hidden md:table-cell">Reason</TH><TH><span className="sr-only">Actions</span></TH></THead>
                <TBody>
                  {grants.map((g) => {
                    const cur = isCurrent(g.starts_on, g.ends_on, today);
                    return (
                      <TR key={g.id} className={cur ? "" : "text-muted"}>
                        <TD><span className="font-medium">{permissions?.find((p) => p.key === g.permission_key)?.description ?? g.permission_key}</span>{g.is_override && <> <Badge tone="warning">Override</Badge></>}</TD>
                        <TD>{formatDate(g.starts_on)}</TD>
                        <TD>{g.ends_on ? formatDate(g.ends_on) : "No expiry"}</TD>
                        <TD className="hidden text-[13px] md:table-cell">{g.reason}{nameOf(g.granter) && <div className="text-muted">by {nameOf(g.granter)}</div>}</TD>
                        <TD>{canRoles && cur && <ActionButton action={endGrant} fields={{ account_id: id, grant_id: g.id }} variant="subtle" confirm="Withdraw this permission now?">Withdraw</ActionButton>}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            ) : <p className="p-5 text-sm text-muted">No individual permissions.</p>}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Account">
            <DescriptionList columns={1} items={[
              { label: "Sign-in email", value: person?.email },
              { label: "Membership number", value: person?.membership_number },
              { label: "Last sign-in", value: account.last_sign_in_at ? formatDateTime(account.last_sign_in_at) : "Never" },
              { label: "Two-step verification", value: !account.auth_user_id ? "Not yet signed up" : mfa ? (mfa.verified ? `Set up (${mfa.verified} authenticator${mfa.verified === 1 ? "" : "s"})` : "Not set up") : "Unknown" },
              { label: "Required", value: account.mfa_required ? "Yes, because of a management role or administrative permission" : "No" },
              { label: "Created", value: formatDate(account.created_at) },
            ]} />
          </Panel>

          <Panel title="Open work" actions={canTransfer && ((openTasks ?? 0) + (openCases ?? 0)) > 0 ? <TransferWorkForm action={transferWork} fromAccount={id} name={person?.display_name ?? "this person"} accounts={canTransfer ? await activeManagementAccounts(db) : []} trigger="Transfer" /> : undefined}>
            <p className="text-sm">{openTasks ?? 0} open tasks · {openCases ?? 0} open support requests</p>
            <p className="mt-1 text-[13px] text-muted">Completed work and history always stay with the person who did it.</p>
          </Panel>

          {canUsers && (
            <Panel title="Invitations">
              {invitations?.length ? (
                <ul className="space-y-3 text-sm">
                  {invitations.map((inv) => {
                    const open = !inv.accepted_at && !inv.revoked_at;
                    const state = inv.accepted_at ? `Accepted ${formatDate(inv.accepted_at)}` : inv.revoked_at ? `Withdrawn ${formatDate(inv.revoked_at)}` : inv.expires_at < new Date().toISOString() ? `Expired ${formatDate(inv.expires_at)}` : `Open until ${formatDate(inv.expires_at)}`;
                    return (
                      <li key={inv.id}>
                        <div>Sent {formatDateTime(inv.created_at)} to {inv.email}</div>
                        <div className="text-[13px] text-muted">{state}</div>
                        {open && account.status === "invited" && (
                          <div className="mt-1.5 flex gap-2">
                            <ActionButton action={resendInvite} fields={{ invitation_id: inv.id, account_id: id }}>Resend</ActionButton>
                            <ActionButton action={revokeInvite} fields={{ invitation_id: inv.id, account_id: id }} variant="subtle" confirm="Withdraw this invitation?">Withdraw</ActionButton>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="text-sm text-muted">No invitations recorded.</p>}
            </Panel>
          )}
          {can(session, "admin.audit") && <p className="text-sm"><Link className="font-medium text-navy-800 underline" href={`/admin/audit?entity=user_account&id=${id}`}>Audit history for this account</Link></p>}
        </div>
      </div>
    </>
  );
}
