import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/ui/layout";
import { requirePermission } from "@/server/session";
import { TemplateForm } from "../template-form";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage() {
  await requirePermission("comms.templates");
  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/communications", label: "Communications" }, { href: "/communications/templates", label: "Templates" }]} title="New campaign template" />
      <div className="max-w-3xl"><Panel><TemplateForm placeholders={["first_name", "name"]} /></Panel></div>
    </>
  );
}
