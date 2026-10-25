import { notFound } from "next/navigation";
import { PortalShell } from "@/components/portal/portal-shell";
import { requireSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

/** The Lodge Mentor portal exists only for users it has been activated for. Everyone else gets a 404. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (session.portalLodgeIds.length === 0) notFound();
  const db = await supabaseServer();
  const { data: lodges } = await db.from("lodges").select("id, name, number").in("id", session.portalLodgeIds).order("number");
  return <PortalShell session={session} lodges={(lodges ?? []).map((l) => ({ id: l.id, label: `${l.name} No. ${l.number}` }))}>{children}</PortalShell>;
}
