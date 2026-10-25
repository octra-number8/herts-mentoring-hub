import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/ui/layout";
import { requirePermission } from "@/server/session";
import { ArticleEditor } from "../knowledge-forms";

export const metadata: Metadata = { title: "New article" };

export default async function NewArticlePage() {
  await requirePermission("knowledge.manage");
  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/library", label: "Library" }, { href: "/library/knowledge", label: "Knowledge base" }]} title="New article"
        description="Articles start as drafts. An approver publishes them. Never include anything that identifies a Brother or Lodge in a practical example." />
      <Panel className="max-w-3xl"><ArticleEditor /></Panel>
    </>
  );
}
