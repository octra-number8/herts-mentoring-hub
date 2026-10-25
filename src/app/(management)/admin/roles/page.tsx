import type { Metadata } from "next";
import Link from "next/link";
import { RolePermissionEditor } from "@/components/admin/role-editor";
import { Badge } from "@/components/ui/badge";
import { Alert, PageHeader, Panel } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { LEADERSHIP_ROLES } from "@/server/admin/accounts";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { setRolePermissions } from "./actions";

export const metadata: Metadata = { title: "Roles and permissions" };

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const session = await requirePermission("admin.roles", "admin.users");
  const sp = await searchParams;
  const db = await supabaseServer();
  const [{ data: roles }, { data: perms }, { data: features }, { data: rp }] = await Promise.all([
    db.from("roles").select("id, key, name, description, is_management").order("is_management", { ascending: false }).order("name"),
    db.from("permissions").select("key, feature_key, action, description").order("key"),
    db.from("features").select("key, name"),
    db.from("role_permissions").select("role_id, permission_key"),
  ]);
  const held = new Set((rp ?? []).map((x) => `${x.role_id}|${x.permission_key}`));
  const featureName = new Map((features ?? []).map((f) => [f.key, f.name]));
  const groups = [...new Set((perms ?? []).map((p) => p.feature_key))].map((f) => ({ feature: featureName.get(f) ?? f, permissions: (perms ?? []).filter((p) => p.feature_key === f) }));
  const editing = can(session, "admin.roles") ? roles?.find((r) => r.key === sp.role && !LEADERSHIP_ROLES.includes(r.key)) : undefined;

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/admin", label: "Administration" }]} title="Roles and permissions"
        description="What each role can do. Effective access also needs two-step verification where required and the feature to be enabled; feature settings never widen access." />

      {editing && (
        <Panel title={`Edit ${editing.name}`} description={editing.description} className="mb-6" actions={<Link href="/admin/roles" className="text-sm underline">Close</Link>}>
          <RolePermissionEditor action={setRolePermissions} roleId={editing.id} roleName={editing.name} groups={groups}
            held={(perms ?? []).filter((p) => held.has(`${editing.id}|${p.key}`)).map((p) => p.key)} />
        </Panel>
      )}

      <div className="mb-4"><Alert tone="info">Roles marked &quot;Two-step&quot; require an authenticator app. Provincial Grand Mentor and Deputy hold every management permission and cannot be edited.{!can(session, "admin.roles") && " You can view this matrix; changing it needs the role administration permission."}</Alert></div>

      <Table caption="Permission matrix">
        <THead>
          <TH className="sticky left-0 z-10 bg-canvas">Permission</TH>
          {roles?.map((r) => (
            <TH key={r.id} className="text-center align-bottom">
              <div className="max-w-28 whitespace-normal text-[12px] leading-tight">{r.name}</div>
              {r.is_management && <div className="mt-1"><Badge tone="navy" className="text-[11px]">Two-step</Badge></div>}
              {can(session, "admin.roles") && !LEADERSHIP_ROLES.includes(r.key) && <Link href={`/admin/roles?role=${r.key}`} className="mt-1 block text-[12px] font-medium text-navy-800 underline">Edit</Link>}
            </TH>
          ))}
        </THead>
        <TBody>
          {groups.map((g) => [
            <TR key={g.feature} className="bg-canvas/60 hover:bg-canvas/60"><TD className="sticky left-0 bg-canvas font-semibold text-navy-900">{g.feature}</TD>{roles?.map((r) => <TD key={r.id} />)}</TR>,
            ...g.permissions.map((p) => (
              <TR key={p.key}>
                <TD className="sticky left-0 bg-surface"><div className="min-w-56 text-[13px]">{p.description}</div><div className="text-[12px] text-muted">{p.key}</div></TD>
                {roles?.map((r) => (
                  <TD key={r.id} className="text-center">
                    {held.has(`${r.id}|${p.key}`) ? <span aria-label="Yes" title={`${r.name}: ${p.description}`} className="text-teal-700">●</span> : <span className="sr-only">No</span>}
                  </TD>
                ))}
              </TR>
            )),
          ])}
        </TBody>
      </Table>
    </>
  );
}
