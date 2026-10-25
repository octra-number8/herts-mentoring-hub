"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { LEADERSHIP_ROLES, setAccountStatus } from "@/server/admin/accounts";
import { createInvitation, resendInvitation } from "@/server/admin/invitations";
import { supabaseService } from "@/server/supabase";

export const inviteUser = defineAction(
  z.object({
    mode: z.enum(["existing", "new"]),
    person_id: zf.optionalUuid(),
    title: zf.optionalText(40),
    first_name: zf.optionalText(100),
    last_name: zf.optionalText(100),
    email: z.string().trim().email("Enter a valid email address"),
    roles: z.array(z.string()).min(1, "Choose at least one role"),
    message: zf.optionalText(1000),
  }),
  async (i, { db }) => {
    if (i.mode === "existing" && !i.person_id) throw new UserError("Choose the person to invite, or create a new person.");
    if (i.mode === "new" && (!i.first_name || !i.last_name)) throw new UserError("Enter the first and last name.");
    const res = await createInvitation(db, supabaseService(), {
      personId: i.mode === "existing" ? i.person_id : null, title: i.title, firstName: i.first_name, lastName: i.last_name, email: i.email, roles: i.roles, message: i.message,
    });
    return { message: "Invitation sent. It expires in 7 days.", redirect: `/admin/users/${res.account_id}` };
  },
  { permission: ["admin.users"] },
);

export const resendInvite = defineAction(
  z.object({ invitation_id: zf.uuid(), account_id: zf.optionalUuid() }),
  async (i, { db }) => {
    await resendInvitation(db, supabaseService(), i.invitation_id);
    return { message: "A new invitation has been sent. The previous link no longer works.", revalidate: ["/admin/users", ...(i.account_id ? [`/admin/users/${i.account_id}`] : [])] };
  },
  { permission: ["admin.users"] },
);

export const revokeInvite = defineAction(
  z.object({ invitation_id: zf.uuid(), account_id: zf.optionalUuid() }),
  async (i, { db }) => {
    check(await db.rpc("admin_revoke_invitation", { p_invitation: i.invitation_id }));
    return { message: "Invitation withdrawn.", revalidate: ["/admin/users", ...(i.account_id ? [`/admin/users/${i.account_id}`] : [])] };
  },
  { permission: ["admin.users"] },
);

export const changeStatus = defineAction(
  z.object({ account_id: zf.uuid(), status: z.enum(["active", "suspended", "deactivated"]), reason: zf.required("Reason", 500) }),
  async (i, { db }) => {
    await setAccountStatus(db, supabaseService(), i.account_id, i.status, i.reason);
    const msg = { active: "Account reactivated. They can sign in again.", suspended: "Account suspended and signed out everywhere.", deactivated: "Account deactivated: roles, grants and portal access ended, and signed out everywhere." }[i.status];
    return { message: msg, revalidate: [`/admin/users/${i.account_id}`, "/admin/users"] };
  },
  { permission: ["admin.users"] },
);

export const addRole = defineAction(
  z.object({ account_id: zf.uuid(), role_id: zf.uuid("Role"), starts_on: zf.date("Start date"), ends_on: zf.optionalDate(), reason: zf.optionalText(500) }),
  async (i, { db, session }) => {
    if (i.ends_on && i.ends_on < i.starts_on) throw new UserError("The end date must be after the start date.");
    const role = check(await db.from("roles").select("key, name").eq("id", i.role_id).single());
    if (LEADERSHIP_ROLES.includes(role.key) && !session.roles.some((r) => LEADERSHIP_ROLES.includes(r))) throw new UserError("Only Provincial leadership can appoint to a leadership role.");
    check(await db.from("role_assignments").insert({ org_id: session.orgId, account_id: i.account_id, role_id: i.role_id, starts_on: i.starts_on, ends_on: i.ends_on, reason: i.reason, granted_by: session.accountId }));
    return { message: `${role.name} added.`, revalidate: [`/admin/users/${i.account_id}`] };
  },
  { permission: ["admin.roles"] },
);

export const endRole = defineAction(
  z.object({ account_id: zf.uuid(), assignment_id: zf.uuid(), ends_on: zf.date("Last day") }),
  async (i, { db }) => {
    const res = await db.from("role_assignments").update({ ends_on: i.ends_on }).eq("id", i.assignment_id).eq("account_id", i.account_id).select("id");
    if (!check(res).length) throw new UserError("You do not have permission to change roles.");
    return { message: "Role end date recorded.", revalidate: [`/admin/users/${i.account_id}`] };
  },
  { permission: ["admin.roles"] },
);

export const addGrant = defineAction(
  z.object({
    account_id: zf.uuid(), permission_key: z.string().min(1, "Choose a permission"), starts_on: zf.date("Start date"), ends_on: zf.optionalDate(),
    is_override: zf.checkbox(), reason: zf.required("Reason", 500),
  }),
  async (i, { db, session }) => {
    if (i.ends_on && i.ends_on < i.starts_on) throw new UserError("The expiry must be after the start date.");
    check(await db.from("permission_grants").insert({ org_id: session.orgId, account_id: i.account_id, permission_key: i.permission_key, starts_on: i.starts_on,
      ends_on: i.ends_on, is_override: i.is_override, reason: i.reason, granted_by: session.accountId }));
    return { message: "Permission granted. It is recorded in the audit log.", revalidate: [`/admin/users/${i.account_id}`] };
  },
  { permission: ["admin.roles"] },
);

export const endGrant = defineAction(
  z.object({ account_id: zf.uuid(), grant_id: zf.uuid() }),
  async (i, { db }) => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const { data: g } = await db.from("permission_grants").select("starts_on").eq("id", i.grant_id).single();
    const ends = g && g.starts_on > yesterday ? new Date(new Date(g.starts_on).getTime() - 86400000).toISOString().slice(0, 10) : yesterday;
    const res = await db.from("permission_grants").update({ ends_on: ends }).eq("id", i.grant_id).eq("account_id", i.account_id).select("id");
    if (!check(res).length) throw new UserError("You do not have permission to change grants.");
    return { message: "Permission withdrawn.", revalidate: [`/admin/users/${i.account_id}`] };
  },
  { permission: ["admin.roles"] },
);
