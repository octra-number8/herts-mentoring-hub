import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "./supabase";
import type { Permission } from "@/lib/permissions";

export type SessionContext = {
  accountId: string;
  personId: string;
  orgId: string;
  displayName: string;
  firstName: string;
  email: string | null;
  mfaRequired: boolean;
  aal: "aal1" | "aal2";
  org: { name: string; short_name: string; slug: string; settings: Record<string, unknown> };
  roles: string[];
  permissions: Set<string>;
  portalLodgeIds: string[];
  allocatedLodgeIds: string[];
  unreadNotifications: number;
};

type RawContext = {
  account_id: string; person_id: string; org_id: string; display_name: string; first_name: string; email: string | null;
  mfa_required: boolean; aal: "aal1" | "aal2"; org: SessionContext["org"]; roles: string[] | null; permissions: string[] | null;
  portal_lodge_ids: string[] | null; allocated_lodge_ids: string[] | null; unread_notifications: number;
};

/**
 * The caller's identity and effective permissions, resolved once per request.
 * Permissions here drive navigation and early refusals only; the database
 * enforces the same rules on every query.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.rpc("my_context");
  const raw = data as unknown as RawContext | null;
  if (!raw) return null;
  return {
    accountId: raw.account_id,
    personId: raw.person_id,
    orgId: raw.org_id,
    displayName: raw.display_name,
    firstName: raw.first_name,
    email: raw.email,
    mfaRequired: raw.mfa_required,
    aal: raw.aal,
    org: raw.org,
    roles: raw.roles ?? [],
    permissions: new Set(raw.permissions ?? []),
    portalLodgeIds: raw.portal_lodge_ids ?? [],
    allocatedLodgeIds: raw.allocated_lodge_ids ?? [],
    unreadNotifications: raw.unread_notifications ?? 0,
  };
});

export const can = (s: SessionContext | null, p: Permission) => !!s?.permissions.has(p);
export const canAny = (s: SessionContext | null, ps: Permission[]) => ps.some((p) => can(s, p));

/** Signed in, account active and MFA satisfied where required. */
export async function requireSession(): Promise<SessionContext> {
  const s = await getSession();
  if (!s) {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    redirect(data.user ? "/account-unavailable" : "/login");
  }
  if (s.mfaRequired && s.aal !== "aal2") redirect("/mfa");
  return s;
}

/** Refuse with 404 rather than revealing that a protected page exists. */
export async function requirePermission(...anyOf: Permission[]): Promise<SessionContext> {
  const s = await requireSession();
  if (!canAny(s, anyOf)) notFound();
  return s;
}

export const isManagementUser = (s: SessionContext) => can(s, "hub.access_management");

/** Where a user lands after signing in. */
export function homeFor(s: SessionContext): string {
  if (isManagementUser(s)) return can(s, "dashboard.view") ? "/dashboard" : "/admin";
  if (s.portalLodgeIds.length) return "/portal";
  if (can(s, "academy.learn") || can(s, "academy.author")) return "/academy";
  return "/account";
}
