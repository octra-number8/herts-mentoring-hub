import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { stripMarkdown } from "@/lib/markdown";
import { formatDate } from "@/lib/utils";
import { articleKindLabel, pendingAcknowledgements } from "@/server/library/documents";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { AcknowledgeButton } from "@/components/library/acknowledge-button";

export const metadata: Metadata = { title: "Resources" };

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requirePermission("academy.learn", "docs.read.mentors");
  const { q } = await searchParams;
  const db = await supabaseServer();
  // Only learning material here, even for people whose role reads more widely.
  const classes = can(session, "docs.read.mentors") ? ["learning", "mentors"] : ["learning"];
  const term = (q ?? "").replace(/[%,().:*"\\]/g, " ").trim();

  let docsQ = db.from("documents").select("id, reference, title, summary, classification, requires_ack, renew_ack_on_revision, current_version_id, category:document_categories(name), current:document_versions!documents_current_version_fk(id, version_label, published_at, file_name)")
    .in("classification", classes).not("current_version_id", "is", null).is("archived_at", null).order("reference");
  let artQ = db.from("knowledge_articles").select("id, slug, title, kind, audience, body_markdown").eq("status", "published").in("audience", classes).order("title");
  if (term) {
    docsQ = docsQ.or(`title.ilike.%${term}%,summary.ilike.%${term}%,reference.ilike.%${term}%`);
    artQ = artQ.or(`title.ilike.%${term}%,search.wfts(english).${term}`);
  }
  const [{ data: docs }, { data: articles }, { data: solomon }] = await Promise.all([
    docsQ, artQ,
    can(session, "academy.learn") ? db.from("solomon_resources").select("id, title, url, description").order("position") : Promise.resolve({ data: [] }),
  ]);
  const pending = await pendingAcknowledgements(db, session.personId, docs ?? []);

  return (
    <>
      <PageHeader title="Resources" description="Guidance and reading to support you, whenever it is useful. Everything here has been approved for you." />
      <form method="get" role="search" className="mb-8 flex max-w-xl gap-2">
        <label htmlFor="res-q" className="sr-only">Search resources</label>
        <input id="res-q" type="search" name="q" defaultValue={q} placeholder="Search guides and answers" className="block w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-100" />
        <button type="submit" className={buttonClass("secondary")}>Search</button>
      </form>

      <div className="space-y-10">
        <section aria-labelledby="docs-h">
          <h2 id="docs-h" className="mb-3 text-lg font-semibold text-navy-900">Guides and documents</h2>
          {docs?.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {docs.map((d) => {
                const cur = d.current as unknown as { id: string; version_label: string; published_at: string | null; file_name: string | null } | null;
                return (
                  <li key={d.id} id={`doc-${d.id}`} className="flex flex-col rounded-lg border border-line bg-surface p-4">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                      <span>{(d.category as unknown as { name: string } | null)?.name}</span>
                      {pending.has(d.id) && <Badge tone="teal">Please read and acknowledge</Badge>}
                    </div>
                    <p className="font-semibold text-navy-900">{d.title}</p>
                    {d.summary && <p className="mt-1 text-sm text-slate-ink">{d.summary}</p>}
                    <p className="mt-2 text-[13px] text-muted">{cur?.version_label}{cur?.published_at ? `, published ${formatDate(cur.published_at)}` : ""}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {cur && <a href={`/api/documents/${cur.id}`} className={buttonClass("secondary", "sm")}>Download<span className="sr-only"> {d.title}</span></a>}
                      {pending.has(d.id) && cur && <AcknowledgeButton documentId={d.id} versionId={cur.id} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState title={term ? "No guides match your search" : "No guides published yet"}>{term ? <Link href="/academy/resources" className="underline">Show everything</Link> : "Approved guides will appear here."}</EmptyState>}
        </section>

        <section aria-labelledby="kb-h">
          <h2 id="kb-h" className="mb-3 text-lg font-semibold text-navy-900">Questions and good practice</h2>
          {articles?.length ? (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {articles.map((a) => (
                <li key={a.id} className="p-4">
                  <Link href={`/academy/resources/${a.slug}`} className="font-medium text-navy-800 hover:underline">{a.title}</Link>
                  <span className="ml-2 text-[13px] text-muted">{articleKindLabel(a.kind)}</span>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-ink">{stripMarkdown(a.body_markdown).slice(0, 220)}</p>
                </li>
              ))}
            </ul>
          ) : <EmptyState title={term ? "No answers match your search" : "Nothing here yet"}>Questions, answers and examples of good practice will appear here.</EmptyState>}
        </section>

        {can(session, "academy.learn") && (
          <section aria-labelledby="sol-h">
            <h2 id="sol-h" className="mb-1 text-lg font-semibold text-navy-900">Solomon</h2>
            <p className="mb-3 text-sm text-muted">Solomon is the United Grand Lodge of England&apos;s learning resource. These links open Solomon in a new tab; you may need to sign in there.</p>
            {solomon?.length ? (
              <ul className="grid gap-3 md:grid-cols-2">
                {solomon.map((s) => (
                  <li key={s.id} className="rounded-lg border border-line bg-surface p-4">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-navy-800 hover:underline">{s.title}<span className="sr-only"> (opens in a new tab)</span></a>
                    {s.description && <p className="mt-1 text-sm text-slate-ink">{s.description}</p>}
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No Solomon links yet" />}
          </section>
        )}
      </div>
    </>
  );
}
