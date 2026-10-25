import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/layout";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ArticleEditor } from "../../knowledge-forms";

export const metadata: Metadata = { title: "Edit article" };

export default async function EditArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePermission("knowledge.manage");
  const { slug } = await params;
  const db = await supabaseServer();
  const { data: a } = await db.from("knowledge_articles").select("id, slug, title, kind, audience, body_markdown, tags, anonymisation_confirmed, status").eq("slug", slug).maybeSingle();
  if (!a) notFound();
  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/library/knowledge", label: "Knowledge base" }, { href: `/library/knowledge/${a.slug}`, label: a.title }]} title="Edit article" />
      <Panel className="max-w-3xl"><ArticleEditor article={a} /></Panel>
    </>
  );
}
