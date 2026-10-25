import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import type { Permission } from "@/lib/permissions";
import { canAny, getSession, type SessionContext } from "./session";
import { supabaseServer, type DB } from "./supabase";

type Ctx = { session: SessionContext; db: DB };
type HandlerResult = void | { message?: string; redirect?: string; data?: unknown; revalidate?: string[] };

/** Convert FormData to a plain object. Keys ending in [] collect multiple values. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    if (key.endsWith("[]")) out[key.slice(0, -2)] = fd.getAll(key).filter((v) => v !== "");
    else {
      const v = fd.get(key);
      out[key] = typeof v === "string" ? v.trim() : v;
    }
  }
  return out;
}

/** Friendly message for database errors. Definer functions raise plain-English messages. */
export function dbErrorMessage(err: { code?: string; message?: string } | null | undefined): string {
  if (!err) return "Something went wrong. Please try again.";
  if (err.code === "42501" || err.code === "P0001") {
    if (err.message?.startsWith("new row violates row-level security")) return "You do not have permission to do that.";
    if (err.message?.includes("permission denied")) return "You do not have permission to do that.";
    return err.message ?? "You do not have permission to do that.";
  }
  if (err.code === "23505") return "That record already exists.";
  if (err.code === "23503") return "This refers to a record that no longer exists.";
  if (err.code === "23514" || err.code === "22P02" || err.code === "22007") return "Some of the information is not in the expected format.";
  console.error("Database error", err);
  return "Something went wrong. Please try again.";
}

export class UserError extends Error {}

/**
 * Defines a server action: validates input, checks the session and optional
 * permissions, runs the handler as the signed-in user (RLS applies), maps errors
 * to friendly messages and revalidates affected paths.
 */
export function defineAction<S extends z.ZodType>(
  schema: S,
  handler: (input: z.infer<S>, ctx: Ctx) => Promise<HandlerResult>,
  opts: { permission?: Permission[]; revalidate?: string[] } = {},
) {
  return async function action(prev: ActionState, formData: FormData): Promise<ActionState> {
    const nonce = (prev?.nonce ?? 0) + 1;
    const session = await getSession();
    if (!session) return { error: "Your session has ended. Please sign in again.", nonce };
    if (session.mfaRequired && session.aal !== "aal2") return { error: "Please complete two-step verification first.", nonce };
    if (opts.permission && !canAny(session, opts.permission)) return { error: "You do not have permission to do that.", nonce };
    const parsed = schema.safeParse(formToObject(formData));
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path.join(".");
        if (!fieldErrors[k]) fieldErrors[k] = issue.message;
      }
      if (process.env.NODE_ENV !== "production") console.warn("Action validation failed", fieldErrors);
      return { error: "Please check the highlighted fields.", fieldErrors, nonce };
    }
    let result: HandlerResult;
    try {
      result = await handler(parsed.data, { session, db: await supabaseServer() });
    } catch (e) {
      if (e instanceof UserError) return { error: e.message, nonce };
      const err = e as { code?: string; message?: string; digest?: string };
      if (err.digest?.startsWith("NEXT_REDIRECT") || err.digest?.startsWith("NEXT_NOT_FOUND")) throw e;
      return { error: dbErrorMessage(err), nonce };
    }
    for (const p of [...(opts.revalidate ?? []), ...(result?.revalidate ?? [])]) revalidatePath(p);
    if (result?.redirect) redirect(result.redirect);
    return { ok: true, message: result?.message, data: result?.data, nonce };
  };
}

/**
 * Throw a friendly error when a Supabase call fails, otherwise return its data.
 * Typed non-null for convenience; calls without .select() return null data.
 */
export function check<T>(res: { data: T; error: { code?: string; message?: string } | null }): NonNullable<T> {
  if (res.error) throw new UserError(dbErrorMessage(res.error));
  return res.data as NonNullable<T>;
}

/** Common Zod helpers for form input. */
export const zf = {
  text: (max = 500) => z.string().trim().max(max),
  required: (label: string, max = 500) => z.string().trim().min(1, `${label} is required`).max(max),
  optionalText: (max = 5000) => z.string().trim().max(max).optional().transform((v) => (v ? v : null)),
  uuid: (label = "Selection") => z.string().uuid(`${label} is required`),
  optionalUuid: () => z.string().optional().transform((v) => (v ? v : null)).pipe(z.string().uuid().nullable()),
  date: (label = "Date") => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} is required`),
  optionalDate: () => z.string().optional().transform((v) => (v ? v : null)).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  datetime: (label = "Date and time") => z.string().min(1, `${label} is required`).transform((v) => new Date(v).toISOString()),
  checkbox: () => z.string().optional().transform((v) => v === "on" || v === "true"),
  int: (label = "Number") => z.coerce.number({ message: `${label} must be a number` }).int(),
  optionalInt: () => z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().nullable()),
  list: () => z.array(z.string()).optional().default([]),
};
