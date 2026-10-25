import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LibraryTabs } from "@/components/library/library-tabs";
import { Badge, statusTone } from "@/components/ui/badge";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate, isoInDays, label, todayIso } from "@/lib/utils";
import { CLASSIFICATIONS, classificationLabel, pendingAcknowledgements } from "@/server/library/documents";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { NewDocumentForm } from "./library-forms";

export const metadata: Metadata = { title: "Library" };

type Search = { q?: string; category?: string; classification?: string; ack?: string; review?: string; archived?: string };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("docs.read.internal", "docs.manage", "knowledge.manage");
  if (!can(session, "docs.read.internal") && !can(session, "docs.manage")) redirect("/library/knowledge");
  const sp = await searchParams;
  const db = await supabaseServer();
  const manager = can(session, "docs.manage");

  let q = db.from("documents")
    .select("id, reference, title, summary, classification, requires_ack, renew_ack_on_revision, review_on, archived_at, current_version_id, category:document_categories(id, name), current:document_versions!documents_current_version_fk(version_label, published_at)")
    .order("reference");
  const term = (sp.q ?? "").replace(/[%,().:*"\\]/g, " ").trim();
  if (term) q = q.or(`title.ilike.%${term}%,reference.ilike.%${term}%,summary.ilike.%${term}%`);
  if (sp.category) q = q.eq("category_id", sp.category);
  if (sp.classification) q = q.eq("classification", sp.classification);
  if (sp.review === "due") q = q.lte("review_on", isoInDays(30));
  q = sp.archived === "1" && manager ? q.not("archived_at", "is", null) : q.is("archived_at", null);

  const [{ data: docsRaw }, { data: categories }, { data: owners }, { count: awaiting }] = await Promise.all([
    q,
    db.from("document_categories").select("id, name, default_classification").order("position"),
    manager ? db.from("user_accounts").select("person_id, persons(display_name)").eq("status", "active") : Promise.resolve({ data: [] }),
    can(session, "docs.approve") ? db.from("document_versions").select("id", { count: "exact", head: true }).in("status", ["review", "approved"]) : Promise.resolve({ count: 0 }),
  ]);
  const docs = docsRaw ?? [];
  const pending = await pendingAcknowledgements(db, session.personId, docs);
  const { data: inProgress } = manager && docs.length
    ? await db.from("document_versions").select("document_id, status").in("document_id", docs.map((d) => d.id)).in("status", ["draft", "review", "approved"])
    : { data: [] };
  const work = new Map((inProgress ?? []).map((v) => [v.document_id, v.status]));
  const rows = sp.ack === "mine" ? docs.filter((d) => pending.has(d.id)) : docs;
  const today = todayIso();
  const allowedClasses = CLASSIFICATIONS.filter((c) => c.value !== "leadership" || can(session, "docs.read.leadership")).map((c) => c.value);

  return (
    <>
      <PageHeader
        title="Library"
        description="Controlled guidance, papers and templates. You see the documents your role allows; drafts are visible only to library managers."
        actions={manager ? (
          <NewDocumentForm
            categories={(categories ?? []).map((c) => ({ value: c.id, label: c.name, cls: c.default_classification }))}
            owners={(owners ?? []).map((o) => ({ value: o.person_id, label: (o.persons as unknown as { display_name: string }).display_name })).sort((a, b) => a.label.localeCompare(b.label))}
            classifications={allowedClasses}
          />
        ) : undefined}
      />
      <LibraryTabs session={session} current="documents" pending={awaiting ?? 0} />
      {pending.size > 0 && sp.ack !== "mine" && (
        <p className="mb-4 rounded-md border border-teal-100 bg-teal-50 px-4 py-2.5 text-sm text-teal-800">
          {pending.size === 1 ? "One document asks" : `${pending.size} documents ask`} you to read and acknowledge it. <Link href="/library?ack=mine" className="font-medium underline">Show {pending.size === 1 ? "it" : "them"}</Link>
        </p>
      )}
      <FilterBar resetHref="/library">
        <FilterSearch defaultValue={sp.q} placeholder="Title, reference or summary" />
        <FilterSelect name="category" label="Category" defaultValue={sp.category} options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        <FilterSelect name="classification" label="Access" defaultValue={sp.classification} options={CLASSIFICATIONS.filter((c) => allowedClasses.includes(c.value)).map((c) => ({ value: c.value, label: c.label }))} />
        <FilterSelect name="ack" label="Acknowledgement" defaultValue={sp.ack} options={[{ value: "mine", label: "Needs my acknowledgement" }]} />
        <FilterSelect name="review" label="Review" defaultValue={sp.review} options={[{ value: "due", label: "Due within 30 days or overdue" }]} />
        {manager && <FilterSelect name="archived" label="Archive" defaultValue={sp.archived} placeholder="Current documents" options={[{ value: "1", label: "Archived documents" }]} />}
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState title={docs.length ? "Nothing matches these filters" : "No documents yet"}>
          {docs.length || Object.keys(sp).length ? <Link href="/library" className="underline">Clear the filters</Link> : manager ? "Create the first document to start the library." : "Documents appear here once they are published."}
        </EmptyState>
      ) : (
        <Table caption="Documents">
          <THead>
            <TH>Ref.</TH><TH>Document</TH><TH className="hidden md:table-cell">Category</TH><TH className="hidden lg:table-cell">Access</TH>
            <TH className="hidden md:table-cell">Current issue</TH><TH className="hidden lg:table-cell">Review by</TH><TH>Status</TH>
          </THead>
          <TBody>
            {rows.map((d) => {
              const cur = d.current as unknown as { version_label: string; published_at: string | null } | null;
              const cat = d.category as unknown as { name: string } | null;
              const reviewDue = d.review_on && d.review_on <= today;
              return (
                <TR key={d.id}>
                  <TD className="whitespace-nowrap text-muted">{d.reference}</TD>
                  <TD>
                    <RowLink href={`/library/${d.id}`}>{d.title}</RowLink>
                    {d.summary && <div className="max-w-md text-[13px] text-muted">{d.summary}</div>}
                  </TD>
                  <TD className="hidden md:table-cell">{cat?.name}</TD>
                  <TD className="hidden lg:table-cell">{classificationLabel(d.classification)}</TD>
                  <TD className="hidden md:table-cell">{cur ? <>{cur.version_label}<div className="text-[13px] text-muted">{formatDate(cur.published_at)}</div></> : <span className="text-muted">Not yet published</span>}</TD>
                  <TD className="hidden lg:table-cell">{d.review_on ? <span className={reviewDue ? "font-medium text-warning-800" : ""}>{formatDate(d.review_on)}{reviewDue ? " (due)" : ""}</span> : ""}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {d.archived_at ? <Badge>Archived</Badge> : cur ? <Badge tone="success">Published</Badge> : null}
                      {work.get(d.id) && <Badge tone={statusTone(work.get(d.id))}>{work.get(d.id) === "draft" ? "Draft in progress" : label(work.get(d.id))}</Badge>}
                      {pending.has(d.id) && <Badge tone="teal">Please acknowledge</Badge>}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}
