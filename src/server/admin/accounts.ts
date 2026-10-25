import "server-only";
import type { DB } from "../supabase";

/** Roles only someone with admin.roles may grant or change (Provincial leadership and technical administration). */
export const LEADERSHIP_ROLES = ["prov_grand_mentor", "deputy_prov_grand_mentor"];
export const PROTECTED_INVITE_ROLES = ["prov_grand_mentor", "deputy_prov_grand_mentor", "tech_admin"];

const BAN_FOREVER = "876000h"; // 100 years: Supabase has no permanent ban, and auth users are never deleted.

/**
 * Change an account's status (permission-checked and audited by
 * account_set_status), then block or restore sign-in at the authentication
 * layer so a suspended or deactivated user is signed out everywhere: banned
 * users cannot refresh their session, and the Hub refuses inactive accounts on
 * every request. Auth users are never deleted.
 */
export async function setAccountStatus(db: DB, svc: DB, accountId: string, status: "active" | "suspended" | "deactivated", reason: string) {
  const { error } = await db.rpc("account_set_status", { p_account: accountId, p_status: status, p_reason: reason });
  if (error) throw error;
  const { data: acc } = await db.from("user_accounts").select("org_id, auth_user_id").eq("id", accountId).single();
  if (!acc?.auth_user_id) return { authUpdated: false };
  const { error: banError } = await svc.auth.admin.updateUserById(acc.auth_user_id, { ban_duration: status === "active" ? "none" : BAN_FOREVER });
  await svc.rpc("admin_record_audit", {
    p_org: acc.org_id, p_action: status === "active" ? "auth.sign_in_restored" : "auth.sign_in_blocked", p_entity_type: "user_account", p_entity_id: accountId,
    p_details: { ok: !banError, status },
  });
  if (banError) throw new Error("The account status changed, but sign-in could not be updated at the authentication service. Please try again.");
  return { authUpdated: true };
}

/** Two-step verification factors for an account (status only, never secrets). */
export async function mfaFactors(svc: DB, authUserId: string | null): Promise<{ verified: number; total: number } | null> {
  if (!authUserId) return null;
  const { data, error } = await svc.auth.admin.mfa.listFactors({ userId: authUserId });
  if (error || !data) return null;
  const factors = data.factors ?? [];
  return { verified: factors.filter((f) => f.status === "verified").length, total: factors.length };
}

/** Active accounts holding a current management role, for choosing who receives transferred work. */
export async function activeManagementAccounts(db: DB): Promise<{ value: string; label: string }[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db.from("user_accounts")
    .select("id, persons(display_name), role_assignments!role_assignments_account_id_fkey(starts_on, ends_on, roles(name, is_management))").eq("status", "active");
  return (data ?? []).map((a) => {
    const roles = ((a.role_assignments ?? []) as unknown as { starts_on: string; ends_on: string | null; roles: { name: string; is_management: boolean } }[])
      .filter((r) => r.starts_on <= today && (!r.ends_on || r.ends_on >= today) && r.roles.is_management).map((r) => r.roles.name);
    return { value: a.id, label: `${(a.persons as unknown as { display_name: string } | null)?.display_name ?? "Unknown"}${roles.length ? ` (${roles.join(", ")})` : ""}`, ok: roles.length > 0 };
  }).filter((a) => a.ok).map(({ value, label }) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}
