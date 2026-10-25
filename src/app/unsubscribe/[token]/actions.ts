"use server";

import type { ActionState } from "@/lib/action-state";
import { supabaseService } from "@/server/supabase";

const SCOPES = ["news", "learning", "events", "all"] as const;

/** Public (no sign-in): the token itself is the authority, as in the email footer. */
export async function unsubscribe(prev: ActionState, fd: FormData): Promise<ActionState> {
  const nonce = (prev?.nonce ?? 0) + 1;
  const token = String(fd.get("token") ?? "");
  const scope = String(fd.get("scope") ?? "");
  if (!/^[0-9a-f]{20,80}$/i.test(token)) return { error: "This unsubscribe link is not valid.", nonce };
  if (!(SCOPES as readonly string[]).includes(scope)) return { error: "Choose which emails to stop.", fieldErrors: { scope: "Choose an option" }, nonce };
  const { data, error } = await supabaseService().rpc("unsubscribe_by_token", { p_token: token, p_scope: scope });
  if (error) return { error: "Something went wrong. Please try again.", nonce };
  if (!data) return { error: "This unsubscribe link is not valid or has expired.", nonce };
  return { ok: true, data: { scope }, nonce };
}
