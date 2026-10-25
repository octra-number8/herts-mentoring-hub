import type { Metadata } from "next";
import { UploadForm } from "@/components/imports/import-forms";
import { PageHeader, Panel } from "@/components/ui/layout";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { uploadImport } from "../actions";

export const metadata: Metadata = { title: "New import" };

export default async function NewImportPage() {
  await requirePermission("imports.run");
  const db = await supabaseServer();
  const { data: templates } = await db.from("import_templates").select("id, name").order("name");
  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/imports", label: "Imports" }]} title="New membership import"
        description="Upload a report exported from Hermes, Adelphi or the UGLE Portal. Nothing changes until the import is reviewed and approved." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Upload"><UploadForm action={uploadImport} templates={templates ?? []} /></Panel>
        </div>
        <Panel title="What happens next">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-ink">
            <li>The report format is identified, or you match its columns to Hub fields.</li>
            <li>Every row is checked: required fields, dates and that the Lodge exists.</li>
            <li>Rows are matched to existing members by membership number, then by name and Lodge.</li>
            <li>You review new members, field-level updates, possible duplicates, conflicts and possible removals, and decide anything that needs a person to look at it.</li>
            <li>Someone who can approve imports commits it. Every step is recorded.</li>
          </ol>
        </Panel>
      </div>
    </>
  );
}
