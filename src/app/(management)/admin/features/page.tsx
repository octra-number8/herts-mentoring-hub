import type { Metadata } from "next";
import { ActivatePortalForm, DeactivatePortalForm, FeatureSettingForm } from "@/components/admin/feature-forms";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { activatePortal, deactivatePortal, saveFeatureSetting } from "./actions";

export const metadata: Metadata = { title: "Feature activation" };

const ACTION_LABELS: Record<string, string> = { read: "View", create: "Support requests", update: "Changes and arrangements", export: "Export" };
const nameOf = (x: unknown) => (x as { persons: { display_name: string } } | null)?.persons?.display_name ?? "";

export default async function FeaturesPage() {
  await requirePermission("admin.features");
  const db = await supabaseServer();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: features }, { data: settings }, { data: activations }, { data: lodges }, { data: roles }, { data: mentorAssignments }, { data: lmAppointments }] = await Promise.all([
    db.from("features").select("key, name, description, activation_mode").order("name"),
    db.from("feature_settings").select("feature_key, enabled, actions, updated_at"),
    db.from("feature_activations").select("id, scope_type, account_id, lodge_id, role_id, actions, active, reason, created_at, deactivated_at, lodges(name, number), roles(name), account:user_accounts!feature_activations_account_id_fkey(persons(display_name)), activator:user_accounts!feature_activations_activated_by_fkey(persons(display_name))")
      .eq("feature_key", "lodge_portal").order("created_at", { ascending: false }).limit(100),
    db.from("lodges").select("id, name, number").order("number"),
    db.from("roles").select("id, key, name, role_permissions!inner(permission_key)").like("role_permissions.permission_key", "lodge_portal.%"),
    db.from("role_assignments").select("account_id, starts_on, ends_on, roles!inner(key), user_accounts!role_assignments_account_id_fkey!inner(status, person_id, persons(display_name))").eq("roles.key", "lodge_mentor"),
    db.from("lodge_appointments").select("person_id, starts_on, ends_on, lodges(number)").in("office", ["lodge_mentor", "assistant_lodge_mentor"]),
  ]);

  const lodgesOfPerson = (pid: string) => (lmAppointments ?? []).filter((a) => a.person_id === pid && a.starts_on <= today && (!a.ends_on || a.ends_on >= today))
    .map((a) => `No. ${(a.lodges as unknown as { number: number }).number}`);
  const mentors = [...new Map((mentorAssignments ?? []).filter((m) => m.starts_on <= today && (!m.ends_on || m.ends_on >= today))
    .map((m) => {
      const ua = m.user_accounts as unknown as { status: string; person_id: string; persons: { display_name: string } };
      const ls = lodgesOfPerson(ua.person_id);
      return [m.account_id, { value: m.account_id, label: `${ua.persons?.display_name ?? "Unknown"}${ls.length ? ` (${ls.join(", ")})` : " (no current Lodge Mentor appointment)"}${ua.status !== "active" ? ` · ${ua.status}` : ""}` }] as const;
    })).values()].sort((a, b) => a.label.localeCompare(b.label));
  const active = (activations ?? []).filter((a) => a.active);
  const history = (activations ?? []).filter((a) => !a.active).slice(0, 20);
  const targetLabel = (a: (typeof active)[number]) => a.scope_type === "account" ? nameOf(a.account) || "Account"
    : a.scope_type === "lodge" ? (() => { const l = a.lodges as unknown as { name: string; number: number } | null; return l ? `${l.name} No. ${l.number}` : "Lodge"; })()
    : `Role: ${(a.roles as unknown as { name: string } | null)?.name ?? ""}`;

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/admin", label: "Administration" }]} title="Feature activation"
        description="Switch modules and their actions on or off for the Province, and control the Lodge Mentor portal. Switching a feature off removes access; it never grants any." />

      <Panel title="Lodge Mentor portal" className="mb-6"
        description="Built and tested, and closed by default. It gives a Lodge Mentor management access to their own Lodge only."
        actions={<ActivatePortalForm action={activatePortal} mentors={mentors} lodges={(lodges ?? []).map((l) => ({ value: l.id, label: `${l.name} No. ${l.number}` }))}
          roles={(roles ?? []).map((r) => ({ value: r.id, label: r.name }))} />}>
        <div className="mb-4"><Alert tone="warning" title="Controlled future access">Activate the portal only where Provincial leadership has agreed. Every activation needs a reason, is audited, and can be removed at any time. Access also needs a current Lodge Mentor appointment.</Alert></div>
        {active.length ? (
          <Table caption="Active portal activations">
            <THead><TH>For</TH><TH className="hidden md:table-cell">Can</TH><TH className="hidden lg:table-cell">Reason</TH><TH><span className="sr-only">Actions</span></TH></THead>
            <TBody>
              {active.map((a) => (
                <TR key={a.id}>
                  <TD><span className="font-medium">{targetLabel(a)}</span><div className="text-[13px] text-muted">{formatDateTime(a.created_at)}{nameOf(a.activator) && ` by ${nameOf(a.activator)}`}</div></TD>
                  <TD className="hidden md:table-cell"><div className="flex flex-wrap gap-1">{Object.entries(a.actions as Record<string, boolean>).filter(([k, v]) => v && ACTION_LABELS[k]).map(([k]) => <Badge key={k} tone="teal">{ACTION_LABELS[k]}</Badge>)}</div></TD>
                  <TD className="hidden text-[13px] lg:table-cell">{a.reason}</TD>
                  <TD><DeactivatePortalForm action={deactivatePortal} scope={a.scope_type} target={(a.account_id ?? a.lodge_id ?? a.role_id)!} label={targetLabel(a)} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState title="The portal is not active for anyone">Lodge Mentors use the Academy only until it is activated for them, their Lodge or their role.</EmptyState>}
        {history.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium text-navy-800">Earlier activations ({history.length})</summary>
            <ul className="mt-2 space-y-1">
              {history.map((a) => <li key={a.id}>{targetLabel(a)} <span className="text-muted">· {formatDateTime(a.created_at)} to {formatDateTime(a.deactivated_at)} · {a.reason}</span></li>)}
            </ul>
          </details>
        )}
      </Panel>

      <h2 className="mb-3 text-[15px] font-semibold text-navy-900">Modules</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(features ?? []).map((f) => {
          const s = settings?.find((x) => x.feature_key === f.key);
          return (
            <Panel key={f.key} title={<>{f.name} {f.activation_mode === "activation_required" && <Badge tone="warning">Activation required</Badge>}</>} description={f.description}>
              <FeatureSettingForm action={saveFeatureSetting} featureKey={f.key} enabled={s?.enabled ?? false} actions={(s?.actions ?? {}) as Record<string, boolean>} locked={f.key === "administration"} />
            </Panel>
          );
        })}
      </div>
    </>
  );
}
