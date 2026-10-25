import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/layout";
import { NewRequestForm } from "@/components/support/support-forms";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { WithAccounts } from "@/components/members/with-accounts";

export const metadata: Metadata = { title: "New support request" };

const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ lodge?: string; member?: string }> }) {
  const session = await requirePermission("cases.write.all", "cases.write.allocated");
  const sp = await searchParams;
  const db = await supabaseServer();
  const [{ data: cats }, { data: lodges }, { data: member }] = await Promise.all([
    db.from("support_categories").select("key, label").eq("active", true).neq("key", "confidential").order("position"),
    db.from("lodges").select("id, name, number").order("number"),
    isUuid(sp.member) ? db.from("persons").select("id, display_name").eq("id", sp.member!).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  return (
    <WithAccounts>
      <PageHeader breadcrumbs={[{ href: "/support", label: "Support" }]} title="New support request"
        description="Record a request for mentoring help. Requests for a Lodge are routed to its allocated Assistant." />
      {can(session, "cases.confidential.submit") && (
        <p className="mb-5 max-w-2xl text-sm text-muted">
          If this is a confidential concern, please use the <Link href="/support/confidential/new" className="font-medium text-navy-800 underline">confidential route</Link> instead.
        </p>
      )}
      <NewRequestForm
        categories={(cats ?? []).map((c) => ({ value: c.key, label: c.label }))}
        lodges={(lodges ?? []).map((l) => ({ value: l.id, label: `${l.name} No. ${l.number}` }))}
        lodgeId={isUuid(sp.lodge) ? sp.lodge : undefined}
        member={member ? { id: member.id, label: member.display_name ?? "" } : null}
      />
    </WithAccounts>
  );
}
