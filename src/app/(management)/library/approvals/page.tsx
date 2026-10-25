import type { Metadata } from "next";
import Link from "next/link";
import { LibraryTabs } from "@/components/library/library-tabs";
import { Badge, statusTone } from "@/components/ui/badge";
import { EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate, label } from "@/lib/utils";
import { articleKindLabel, classificationLabel } from "@/server/library/documents";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { ArticleAction } from "../knowledge/knowledge-forms";
import { ApproveVersionForm, ReturnVersionForm, VersionAction } from "../library-forms";

export const metadata: Metadata = { title: "Library approvals" };

export default async function ApprovalsPage() {
  const session = await requirePermission("docs.approve");
  const db = await supabaseServer();
  const [{ data: versions }, { data: articles }] = await Promise.all([
    db.from("document_versions").select("id, version_label, status, submitted_at, approved_at, change_summary, storage_path, file_name, document:documents!document_versions_document_id_fkey(id, reference, title, classification)")
      .in("status", ["review", "approved"]).order("submitted_at"),
    db.from("knowledge_articles").select("id, slug, title, kind, audience, anonymisation_confirmed, updated_at").eq("status", "review").order("updated_at"),
  ]);

  return (
    <>
      <PageHeader title="Library" description="Documents and knowledge articles awaiting a decision." />
      <LibraryTabs session={session} current="approvals" pending={(versions?.length ?? 0)} />
      <div className="space-y-6">
        <Panel title="Document versions" padded={false}>
          {versions?.length ? (
            <Table className="rounded-none border-0">
              <THead><TH>Document</TH><TH>Version</TH><TH className="hidden md:table-cell">Access</TH><TH>Status</TH><TH>Decision</TH></THead>
              <TBody>
                {versions.map((v) => {
                  const d = v.document as unknown as { id: string; reference: string; title: string; classification: string };
                  return (
                    <TR key={v.id}>
                      <TD><RowLink href={`/library/${d.id}`}>{d.reference} {d.title}</RowLink>{v.change_summary && <div className="max-w-sm text-[13px] text-muted">{v.change_summary}</div>}</TD>
                      <TD>{v.version_label}{v.storage_path && <div><a href={`/api/documents/${v.id}`} className="text-[13px] text-navy-800 underline">Read {v.file_name ?? "file"}</a></div>}</TD>
                      <TD className="hidden md:table-cell">{classificationLabel(d.classification)}</TD>
                      <TD><Badge tone={statusTone(v.status)}>{label(v.status)}</Badge><div className="text-[13px] text-muted">{formatDate(v.status === "review" ? v.submitted_at : v.approved_at)}</div></TD>
                      <TD>
                        <div className="flex flex-wrap gap-2">
                          {v.status === "review" && <><ApproveVersionForm documentId={d.id} versionId={v.id} /><ReturnVersionForm documentId={d.id} versionId={v.id} /></>}
                          {v.status === "approved" && <VersionAction documentId={d.id} versionId={v.id} to="published" variant="teal">Publish</VersionAction>}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          ) : <div className="p-5"><EmptyState title="No document versions are waiting">Versions appear here when a library manager submits them for review.</EmptyState></div>}
        </Panel>
        <Panel title="Knowledge articles" padded={false}>
          {articles?.length ? (
            <Table className="rounded-none border-0">
              <THead><TH>Article</TH><TH className="hidden md:table-cell">Type</TH><TH className="hidden md:table-cell">Audience</TH><TH>Decision</TH></THead>
              <TBody>
                {articles.map((a) => (
                  <TR key={a.id}>
                    <TD><RowLink href={`/library/knowledge/${a.slug}`}>{a.title}</RowLink>{a.kind === "example" && !a.anonymisation_confirmed && <div className="text-[13px] text-warning-800">Anonymisation not yet confirmed: it cannot be published.</div>}</TD>
                    <TD className="hidden md:table-cell">{articleKindLabel(a.kind)}</TD>
                    <TD className="hidden md:table-cell">{classificationLabel(a.audience)}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-2">
                        {(a.kind !== "example" || a.anonymisation_confirmed) && <ArticleAction id={a.id} slug={a.slug} to="published" variant="teal">Publish</ArticleAction>}
                        <ArticleAction id={a.id} slug={a.slug} to="draft">Return to draft</ArticleAction>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <div className="p-5"><EmptyState title="No articles are waiting"><Link href="/library/knowledge" className="underline">Open the knowledge base</Link></EmptyState></div>}
        </Panel>
      </div>
    </>
  );
}
