import type { Metadata } from "next";
import Link from "next/link";
import { LibraryTabs } from "@/components/library/library-tabs";
import { Badge, statusTone } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { formatDate, label } from "@/lib/utils";
import { stripMarkdown } from "@/lib/markdown";
import { ARTICLE_KINDS, AUDIENCES, articleKindLabel, classificationLabel } from "@/server/library/documents";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Knowledge base" };

type Search = { q?: string; kind?: string; audience?: string; status?: string };

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("docs.read.internal", "docs.manage", "knowledge.manage");
  const sp = await searchParams;
  const db = await supabaseServer();
  const editor = can(session, "knowledge.manage");
  let q = db.from("knowledge_articles").select("id, slug, title, kind, audience, status, body_markdown, tags, updated_at, published_at");
  const term = (sp.q ?? "").replace(/[%,().:*"\\]/g, " ").trim();
  if (term) q = q.or(`title.ilike.%${term}%,search.wfts(english).${term}`);
  if (sp.kind) q = q.eq("kind", sp.kind);
  if (sp.audience) q = q.eq("audience", sp.audience);
  if (sp.status) q = q.eq("status", sp.status);
  else if (!editor) q = q.eq("status", "published");
  else q = q.neq("status", "archived");
  const [{ data: articles }, { count: awaiting }] = await Promise.all([
    q.order("title"),
    can(session, "docs.approve") ? db.from("document_versions").select("id", { count: "exact", head: true }).in("status", ["review", "approved"]) : Promise.resolve({ count: 0 }),
  ]);

  return (
    <>
      <PageHeader
        title="Library"
        description="FAQs, guidance, practical examples, approved good practice and training resources."
        actions={editor ? <LinkButton href="/library/knowledge/new" variant="primary">New article</LinkButton> : undefined}
      />
      <LibraryTabs session={session} current="knowledge" pending={awaiting ?? 0} />
      <FilterBar resetHref="/library/knowledge">
        <FilterSearch defaultValue={sp.q} placeholder="Search the knowledge base" />
        <FilterSelect name="kind" label="Type" defaultValue={sp.kind} options={ARTICLE_KINDS.map((k) => ({ value: k.value, label: k.label }))} />
        <FilterSelect name="audience" label="Audience" defaultValue={sp.audience} options={AUDIENCES.map((a) => ({ value: a.value, label: a.label }))} />
        {editor && <FilterSelect name="status" label="Status" defaultValue={sp.status} placeholder="Current" options={["draft", "review", "published", "archived"].map((s) => ({ value: s, label: label(s) }))} />}
      </FilterBar>
      {articles?.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {articles.map((a) => (
            <li key={a.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                <span>{articleKindLabel(a.kind)}</span><span aria-hidden>·</span><span>{classificationLabel(a.audience)}</span>
                {a.status !== "published" && <Badge tone={statusTone(a.status)}>{label(a.status)}</Badge>}
              </div>
              <Link href={`/library/knowledge/${a.slug}`} className="font-semibold text-navy-800 hover:underline">{a.title}</Link>
              <p className="mt-1 line-clamp-2 text-sm text-slate-ink">{stripMarkdown(a.body_markdown).slice(0, 240)}</p>
              <p className="mt-2 text-[13px] text-muted">{a.published_at ? `Published ${formatDate(a.published_at)}` : `Updated ${formatDate(a.updated_at)}`}</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={sp.q || sp.kind || sp.audience || sp.status ? "No articles match" : "No articles yet"}>
          {sp.q || sp.kind || sp.audience || sp.status ? <Link href="/library/knowledge" className="underline">Clear the search</Link> : editor ? "Write the first article to start the knowledge base." : "Published articles will appear here."}
        </EmptyState>
      )}
    </>
  );
}
