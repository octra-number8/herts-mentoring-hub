import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/layout";
import { renderMarkdown } from "@/lib/markdown";
import { articleKindLabel } from "@/server/library/documents";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Resources" };

export default async function ResourceArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await requirePermission("academy.learn", "docs.read.mentors");
  const { slug } = await params;
  const db = await supabaseServer();
  const classes = can(session, "docs.read.mentors") ? ["learning", "mentors"] : ["learning"];
  const { data: a } = await db.from("knowledge_articles").select("title, kind, body_markdown").eq("slug", slug).eq("status", "published").in("audience", classes).maybeSingle();
  if (!a) notFound();
  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/academy/resources", label: "Resources" }]} title={a.title} description={articleKindLabel(a.kind)} />
      <article className="prose-hub max-w-3xl rounded-lg border border-line bg-surface p-6" dangerouslySetInnerHTML={{ __html: renderMarkdown(a.body_markdown) }} />
    </>
  );
}
