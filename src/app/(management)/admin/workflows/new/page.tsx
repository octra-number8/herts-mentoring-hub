import type { Metadata } from "next";
import { WorkflowBuilder } from "@/components/admin/workflow-builder";
import { PageHeader, Panel } from "@/components/ui/layout";
import { builderLists } from "@/server/admin/workflows";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { saveWorkflow } from "../actions";

export const metadata: Metadata = { title: "New workflow" };

export default async function NewWorkflowPage() {
  await requirePermission("workflows.manage");
  const lists = await builderLists(await supabaseServer());
  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/admin", label: "Administration" }, { href: "/admin/workflows", label: "Workflows" }]} title="New workflow"
        description="New workflows start disabled. Save, try a dry run, then enable it." />
      <Panel><WorkflowBuilder action={saveWorkflow} lists={lists} /></Panel>
    </>
  );
}
