import type { Metadata } from "next";
import { Alert, PageHeader } from "@/components/ui/layout";
import { ConfidentialForm } from "@/components/support/support-forms";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Confidential concern" };

export default async function ConfidentialPage() {
  await requirePermission("cases.confidential.submit");
  const db = await supabaseServer();
  const { data: lodges } = await db.from("lodges").select("id, name, number").order("number");

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/support", label: "Support" }]} title="Raise a confidential concern"
        description="Seen only by designated Provincial leadership, who decide how it is handled." />
      <div className="mb-6 max-w-2xl space-y-3">
        <Alert tone="info" title="Before you start">
          <p className="mt-1">The Hub does not manage welfare, safeguarding or disciplinary cases. Those matters are referred through the Province&apos;s existing authorised procedures, and leadership will make sure that happens.</p>
          <p className="mt-2">If anyone is at immediate risk, contact the emergency services first.</p>
        </Alert>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-ink">
          <li>Your concern will not appear on any Lodge page, list, report or search.</li>
          <li>Designated leadership are notified that a concern has arrived, without its content.</li>
          <li>Anyone who opens it is recorded. You can see its status under Support, Raised by me.</li>
        </ul>
      </div>
      <ConfidentialForm lodges={(lodges ?? []).map((l) => ({ value: l.id, label: `${l.name} No. ${l.number}` }))} />
    </>
  );
}
