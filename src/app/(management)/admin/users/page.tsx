import type { Metadata } from "next";
import { InviteForm } from "@/components/admin/user-forms";
import { Badge, statusTone } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/dialog-form";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate, formatDateTime, label } from "@/lib/utils";
import { PROTECTED_INVITE_ROLES } from "@/server/admin/accounts";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { inviteUser, resendInvite, revokeInvite } from "./actions";

export const metadata: Metadata = { title: "Users" };

type Search = { q?: string; status?: string; role?: string };
type Assignment = { starts_on: string; ends_on: string | null; roles: { key: string; name: string } };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("admin.users", "admin.roles");
  const sp = await searchParams;
  const db = await supabaseServer();
  const today = new Date().toISOString().slice(0, 10);
  const q = (sp.q ?? "").trim();
  const safe = q.replace(/[%,()]/g, "");

  const [{ data: accounts }, { data: roles }, { data: invitations }, { data: people }] = await Promise.all([
    db.from("user_accounts").select("id, status, mfa_required, last_sign_in_at, created_at, persons(display_name, email, membership_number), role_assignments!role_assignments_account_id_fkey(starts_on, ends_on, roles(key, name))").order("created_at"),
    db.from("roles").select("id, key, name, description, is_management").order("name"),
    can(session, "admin.users")
      ? db.from("invitations").select("id, email, role_keys, expires_at, created_at, person_id, persons(display_name), inviter:user_accounts!invitations_invited_by_fkey(persons(display_name))")
        .is("accepted_at", null).is("revoked_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    safe.length >= 2
      ? db.from("persons").select("id, display_name, email, membership_number, user_accounts(id)").or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,membership_number.eq.${safe}`).order("last_name").limit(20)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const roleName = new Map((roles ?? []).map((r) => [r.key, r.name]));
  const rows = (accounts ?? []).map((a) => {
    const person = a.persons as unknown as { display_name: string; email: string | null; membership_number: string | null } | null;
    const current = ((a.role_assignments ?? []) as unknown as Assignment[]).filter((r) => r.starts_on <= today && (!r.ends_on || r.ends_on >= today)).map((r) => r.roles);
    return { ...a, person, current };
  }).filter((a) => (!sp.status || a.status === sp.status) && (!sp.role || a.current.some((r) => r.key === sp.role))
    && (!q || `${a.person?.display_name} ${a.person?.email} ${a.person?.membership_number}`.toLowerCase().includes(q.toLowerCase())));
  const withoutAccount = ((people ?? []) as { id: string; display_name: string; email: string | null; membership_number: string | null; user_accounts: unknown }[])
    .filter((p) => !p.user_accounts || (Array.isArray(p.user_accounts) ? p.user_accounts.length === 0 : false));
  const inviteRoles = (roles ?? []).map((r) => ({ ...r, restricted: PROTECTED_INVITE_ROLES.includes(r.key) && !can(session, "admin.roles") }));

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/admin", label: "Administration" }]} title="Users"
        description="Accounts are by invitation only. Each account belongs to one person; Masonic appointments and Hub roles are recorded separately."
        actions={can(session, "admin.users") ? <InviteForm action={inviteUser} roles={inviteRoles} /> : undefined} />

      <FilterBar resetHref="/admin/users">
        <FilterSearch defaultValue={sp.q} placeholder="Name, email or membership number" />
        <FilterSelect name="status" label="Status" defaultValue={sp.status} options={["active", "invited", "suspended", "deactivated"].map((s) => ({ value: s, label: label(s) }))} />
        <FilterSelect name="role" label="Role" defaultValue={sp.role} options={(roles ?? []).map((r) => ({ value: r.key, label: r.name }))} />
      </FilterBar>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {rows.length ? (
            <Table caption="Accounts">
              <THead><TH>Person</TH><TH>Status</TH><TH className="hidden md:table-cell">Roles</TH><TH className="hidden lg:table-cell">Last sign-in</TH></THead>
              <TBody>
                {rows.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <RowLink href={`/admin/users/${a.id}`}>{a.person?.display_name ?? "Restricted record"}</RowLink>
                      <div className="text-[13px] text-muted">{a.person?.email}</div>
                    </TD>
                    <TD><Badge tone={statusTone(a.status)}>{label(a.status)}</Badge>{a.mfa_required && <div className="mt-1 text-[13px] text-muted">Two-step required</div>}</TD>
                    <TD className="hidden text-[13px] md:table-cell">{a.current.map((r) => r.name).join(", ") || <span className="text-muted">No current role</span>}</TD>
                    <TD className="hidden text-[13px] lg:table-cell">{a.last_sign_in_at ? formatDateTime(a.last_sign_in_at) : <span className="text-muted">Never</span>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <EmptyState title="No accounts match">Try a different search, or invite someone.</EmptyState>}

          {safe.length >= 2 && can(session, "admin.users") && (
            <Panel title="People without an account" description="Members and contacts in the Hub matching your search who have not been invited yet.">
              {withoutAccount.length ? (
                <ul className="divide-y divide-line">
                  {withoutAccount.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 text-sm">
                      <span><span className="font-medium">{p.display_name}</span> <span className="text-muted">{[p.membership_number, p.email].filter(Boolean).join(" · ")}</span></span>
                      <InviteForm action={inviteUser} roles={inviteRoles} preset={{ id: p.id, label: p.display_name, email: p.email }} trigger="Invite" triggerVariant="secondary" />
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">Nobody without an account matches &quot;{q}&quot;.</p>}
            </Panel>
          )}
        </div>

        {can(session, "admin.users") && (
          <Panel title="Open invitations" description="Invitations not yet accepted.">
            {invitations?.length ? (
              <ul className="divide-y divide-line">
                {invitations.map((inv) => {
                  const expired = inv.expires_at < new Date().toISOString();
                  return (
                    <li key={inv.id} className="space-y-1.5 py-3 first:pt-0 text-sm">
                      <div className="font-medium">{(inv.persons as unknown as { display_name: string } | null)?.display_name ?? inv.email}</div>
                      <div className="text-[13px] text-muted">{inv.email} · {inv.role_keys.map((k) => roleName.get(k) ?? label(k)).join(", ")}</div>
                      <div className="text-[13px]">{expired ? <Badge tone="warning">Expired {formatDate(inv.expires_at)}</Badge> : <span className="text-muted">Expires {formatDate(inv.expires_at)}</span>}</div>
                      <div className="flex flex-wrap gap-2">
                        <ActionButton action={resendInvite} fields={{ invitation_id: inv.id }}>Resend</ActionButton>
                        <ActionButton action={revokeInvite} fields={{ invitation_id: inv.id }} variant="subtle" confirm="Withdraw this invitation? The link will stop working.">Withdraw</ActionButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-muted">No invitations are waiting.</p>}
          </Panel>
        )}
      </div>
    </>
  );
}
