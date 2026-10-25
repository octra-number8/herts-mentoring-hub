import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, statusTone } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/layout";
import { renderMarkdown } from "@/lib/markdown";
import { formatDate, label } from "@/lib/utils";
import { articleKindLabel, classificationLabel } from "@/server/library/documents";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ArticleAction } from "../knowledge-forms";

export const metadata: Metadata = { title: "Knowledge base" };

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await requirePermission("docs.read.internal", "docs.manage", "knowledge.manage");
  const { slug } = await params;
  const db = await supabaseServer();
  const { data: a } = await db.from("knowledge_articles").select("*").eq("slug", slug).maybeSingle();
  if (!a) notFound();
  const editor = can(session, "knowledge.manage");
  const approver = can(session, "docs.approve");
  const blocked = a.kind === "example" && !a.anonymisation_confirmed;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/library", label: "Library" }, { href: "/library/knowledge", label: "Knowledge base" }]}
        title={a.title}
        meta={
          <>
            <Badge tone="navy">{articleKindLabel(a.kind)}</Badge>
            <span className="text-sm text-muted">For {classificationLabel(a.audience).toLowerCase()}</span>
            {a.status !== "published" && <Badge tone={statusTone(a.status)}>{label(a.status)}</Badge>}
            {a.published_at && <span className="text-sm text-muted">Published {formatDate(a.published_at)}</span>}
          </>
        }
        actions={editor || approver ? (
          <>
            {editor && a.status !== "archived" && <LinkButton href={`/library/knowledge/${a.slug}/edit`}>Edit</LinkButton>}
            {editor && a.status === "draft" && <ArticleAction id={a.id} slug={a.slug} to="review" variant="primary">Submit for review</ArticleAction>}
            {approver && ["draft", "review"].includes(a.status) && !blocked && <ArticleAction id={a.id} slug={a.slug} to="published" variant="teal">Publish</ArticleAction>}
            {editor && a.status === "review" && <ArticleAction id={a.id} slug={a.slug} to="draft">Return to draft</ArticleAction>}
            {editor && a.status !== "archived" && <ArticleAction id={a.id} slug={a.slug} to="archived" variant="danger" confirm="Archive this article? Readers will no longer see it.">Archive</ArticleAction>}
            {editor && a.status === "archived" && <ArticleAction id={a.id} slug={a.slug} to="draft">Restore as draft</ArticleAction>}
          </>
        ) : undefined}
      />
      {blocked && editor && <div className="mb-4"><Alert tone="warning" title="Anonymisation not confirmed">This practical example cannot be published until the editor confirms it has been anonymised.</Alert></div>}
      <article className="prose-hub max-w-3xl rounded-lg border border-line bg-surface p-6" dangerouslySetInnerHTML={{ __html: renderMarkdown(a.body_markdown) }} />
      {a.tags.length > 0 && <p className="mt-3 flex flex-wrap gap-1.5">{a.tags.map((t) => <Badge key={t}>{t}</Badge>)}</p>}
    </>
  );
}
