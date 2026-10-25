import "server-only";
import { supabaseServer } from "@/server/supabase";
import { AccountsProvider } from "./assignee-select";

/** Loads active Provincial accounts once for every AssigneeSelect on the page. */
export async function WithAccounts({ children }: { children: React.ReactNode }) {
  const db = await supabaseServer();
  const { data } = await db.rpc("management_accounts");
  const accounts = (data ?? []).map((a) => ({ id: a.id, label: a.display_name, detail: a.roles }));
  return <AccountsProvider accounts={accounts}>{children}</AccountsProvider>;
}
