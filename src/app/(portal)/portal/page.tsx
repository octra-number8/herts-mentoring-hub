import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/layout";
import { requireSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "My Lodge" };

export default async function PortalHome() {
  const session = await requireSession();
  if (session.portalLodgeIds.length === 1) redirect(`/portal/${session.portalLodgeIds[0]}`);
  const db = await supabaseServer();
  const { data: lodges } = await db.from("lodges").select("id, name, number, meeting_pattern").in("id", session.portalLodgeIds).order("number");
  return (
    <>
      <PageHeader title={`Welcome, ${session.firstName}`} description="The Lodges you look after as Lodge Mentor." />
      <ul className="grid gap-4 sm:grid-cols-2">
        {(lodges ?? []).map((l) => (
          <li key={l.id}>
            <Link href={`/portal/${l.id}`} className="block rounded-lg border border-line bg-surface p-5 hover:border-navy-600">
              <span className="block font-semibold text-navy-900">{l.name} No. {l.number}</span>
              {l.meeting_pattern && <span className="mt-1 block text-sm text-muted">{l.meeting_pattern}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
