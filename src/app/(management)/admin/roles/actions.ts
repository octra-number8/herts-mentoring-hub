"use server";

import { z } from "zod";
import { check, defineAction, UserError, zf } from "@/server/action";
import { LEADERSHIP_ROLES } from "@/server/admin/accounts";

export const setRolePermissions = defineAction(
  z.object({ role_id: zf.uuid(), permissions: zf.list(), confirm: zf.checkbox() }),
  async (i, { db }) => {
    if (!i.confirm) throw new UserError("Tick the confirmation to change what this role can do.");
    const role = check(await db.from("roles").select("id, key, name").eq("id", i.role_id).single());
    if (LEADERSHIP_ROLES.includes(role.key)) throw new UserError("Provincial leadership roles always hold every management permission and cannot be edited here.");
    const [{ data: existing }, { data: catalogue }] = await Promise.all([
      db.from("role_permissions").select("permission_key").eq("role_id", i.role_id),
      db.from("permissions").select("key"),
    ]);
    const valid = new Set((catalogue ?? []).map((p) => p.key));
    const want = new Set(i.permissions.filter((p) => valid.has(p)));
    const have = new Set((existing ?? []).map((p) => p.permission_key));
    const add = [...want].filter((p) => !have.has(p));
    const remove = [...have].filter((p) => !want.has(p));
    if (!add.length && !remove.length) return { message: "No changes." };
    if (add.length) check(await db.from("role_permissions").insert(add.map((k) => ({ role_id: i.role_id, permission_key: k }))));
    if (remove.length) check(await db.from("role_permissions").delete().eq("role_id", i.role_id).in("permission_key", remove));
    return { message: `${role.name}: ${add.length} added, ${remove.length} removed.`, revalidate: ["/admin/roles"] };
  },
  { permission: ["admin.roles"] },
);
