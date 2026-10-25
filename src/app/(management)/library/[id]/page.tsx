import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, statusTone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Alert, DescriptionList, EmptyState, PageHeader, Panel, Timeline } from "@/components/ui/layout";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate, formatDateTime, label, todayIso } from "@/lib/utils";
import { CLASSIFICATIONS, classificationLabel, pendingAcknowledgements } from "@/server/library/documents";
import { AcknowledgeButton } from "@/components/library/acknowledge-button";
import { DoneNotice } from "@/components/reports/done-notice";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import {
  ApproveVersionForm, ArchiveDocumentButton, EditDocumentForm, ReturnVersionForm, ReviewDateForm, UploadVersionForm, VersionAction,
} from "../library-forms";

export const metadata: Metadata = { title: "Document" };

const name = (x: unknown) => (x as { persons?: { display_name: string } } | null)?.persons?.display_name ?? null;
const sizeLabel = (b: number | null) => (b ? (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`) : "");

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const session = await requirePermission("docs.read.internal", "docs.manage", "knowledge.manage");
  const { id } = await params;
  const { done } = await searchParams;
  const db = await supabaseServer();
  const { data: doc } = await db.from("documents")
    .select("*, category:document_categories(id, name), owner:persons!documents_owner_person_id_fkey(display_name)")
    .eq("id", id).maybeSingle();
  if (!doc) notFound();
  const manager = can(session, "docs.manage");
  const approver = can(session, "docs.approve");

  const { data: versions } = await db.from("document_versions")
    .select("*, author:user_accounts!document_versions_created_by_fkey(persons(display_name)), approver:user_accounts!document_versions_approved_by_fkey(persons(display_name)), publisher:user_accounts!document_versions_published_by_fkey(persons(display_name))")
    .eq("document_id", id).order("version_no", { ascending: false });
  const current = (versions ?? []).find((v) => v.id === doc.current_version_id) ?? null;
  const versionIds = (versions ?? []).map((v) => v.id);

  const [pending, { data: acks }, { data: audit }, { data: categories }, { data: owners }] = await Promise.all([
    pendingAcknowledgements(db, session.personId, [doc]),
    manager && current ? db.from("document_acknowledgements").select("acknowledged_at, person_id, persons(display_name)").eq("document_version_id", current.id).order("acknowledged_at", { ascending: false }) : Promise.resolve({ data: [] }),
    // Audit entries are visible only to roles that may read the audit log (RLS).
    versionIds.length ? db.from("audit_events").select("id, action, occurred_at, details, entity_id, actor_account_id").eq("entity_type", "document_version").in("entity_id", versionIds).like("action", "document_version.%").order("occurred_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
    manager ? db.from("document_categories").select("id, name, default_classification").order("position") : Promise.resolve({ data: [] }),
    manager ? db.from("user_accounts").select("person_id, persons(display_name)").eq("status", "active") : Promise.resolve({ data: [] }),
  ]);
  const { data: myAck } = current ? await db.from("document_acknowledgements").select("acknowledged_at").eq("document_version_id", current.id).eq("person_id", session.personId).maybeSingle() : { data: null };
  const actorIds = [...new Set((audit ?? []).map((a) => a.actor_account_id).filter((x): x is string => !!x))];
  const { data: actors } = actorIds.length ? await db.from("user_accounts").select("id, persons(display_name)").in("id", actorIds) : { data: [] };
  const actorName = new Map((actors ?? []).map((a) => [a.id, name(a)]));
  const needsAck = pending.has(doc.id);
  const cat = doc.category as unknown as { id: string; name: string } | null;
  const owner = (doc.owner as unknown as { display_name: string } | null)?.display_name;
  const today = todayIso();
  const labelOf = new Map((versions ?? []).map((v) => [v.id, v.version_label]));
  const allowedClasses = CLASSIFICATIONS.filter((c) => c.value !== "leadership" || can(session, "docs.read.leadership")).map((c) => c.value);

  type Item = { id: string; when: string; sort: string; title: React.ReactNode; body?: React.ReactNode; meta?: React.ReactNode };
  const history: Item[] = [];
  const fromAudit = (audit ?? []).length > 0;
  for (const v of versions ?? []) {
    history.push({ id: `c${v.id}`, sort: v.created_at, when: formatDateTime(v.created_at), title: `${v.version_label}: draft created`, meta: name(v.author) ?? undefined, body: v.change_summary ?? undefined });
    if (fromAudit) continue;
    if (v.submitted_at) history.push({ id: `s${v.id}`, sort: v.submitted_at, when: formatDateTime(v.submitted_at), title: `${v.version_label}: submitted for review` });
    if (v.approved_at) history.push({ id: `a${v.id}`, sort: v.approved_at, when: formatDateTime(v.approved_at), title: `${v.version_label}: approved`, meta: name(v.approver) ?? undefined, body: v.review_note ?? undefined });
    if (v.published_at) history.push({ id: `p${v.id}`, sort: v.published_at, when: formatDateTime(v.published_at), title: `${v.version_label}: published`, meta: name(v.publisher) ?? undefined });
    if (!v.approved_at && v.review_note) history.push({ id: `r${v.id}`, sort: v.submitted_at ?? v.created_at, when: v.submitted_at ? formatDateTime(v.submitted_at) : "", title: `${v.version_label}: returned to draft`, body: v.review_note });
  }
  for (const a of audit ?? []) {
    const note = (a.details as { note?: string } | null)?.note;
    history.push({ id: `x${a.id}`, sort: a.occurred_at, when: formatDateTime(a.occurred_at), title: `${labelOf.get(a.entity_id ?? "") ?? "Version"}: ${label(a.action.replace("document_version.", ""))} (audit log)`, meta: actorName.get(a.actor_account_id ?? "") ?? undefined, body: note ?? undefined });
  }
  history.sort((a, b) => b.sort.localeCompare(a.sort));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/library", label: "Library" }]}
        title={`${doc.reference} ${doc.title}`}
        description={doc.summary || undefined}
        meta={
          <>
            <Badge tone="navy">{classificationLabel(doc.classification)}</Badge>
            {doc.archived_at ? <Badge>Archived</Badge> : current ? <Badge tone="success">Published</Badge> : <Badge>Not yet published</Badge>}
            {doc.requires_ack && <Badge tone="teal">Read and acknowledge</Badge>}
          </>
        }
        actions={
          <>
            {current?.storage_path && <a href={`/api/documents/${current.id}`} className={buttonClass("primary")}>Download current issue</a>}
            {manager && (
              <EditDocumentForm categories={(categories ?? []).map((c) => ({ value: c.id, label: c.name, cls: c.default_classification }))}
                owners={(owners ?? []).map((o) => ({ value: o.person_id, label: name(o) ?? "" })).sort((a, b) => a.label.localeCompare(b.label))}
                doc={doc} classifications={allowedClasses} />
            )}
            {manager && !doc.archived_at && <UploadVersionForm documentId={doc.id} />}
            {manager && <ArchiveDocumentButton documentId={doc.id} archived={!!doc.archived_at} />}
          </>
        }
      />

      <DoneNotice done={done} messages={{
        created: "Document created. Upload the first draft next.", review: "Submitted for review. Approvers have been notified.", draft: "Returned to draft with your note.",
        approved: "Version approved. It can now be published.", published: "Published. Any previous issue has been superseded.", archived: "Version archived.",
        doc_archived: "Document archived. It is hidden from readers but kept with its history.", restored: "Document restored to the library.",
      }} />
      {doc.requires_ack && current && (
        <div className="mb-6">
          {needsAck ? (
            <div className="flex flex-col gap-3 rounded-lg border border-teal-100 bg-teal-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-teal-800">
                <p className="font-semibold">Please read and acknowledge {current.version_label}</p>
                <p>Download and read the document, then confirm. Your acknowledgement is recorded against this issue.</p>
              </div>
              <AcknowledgeButton documentId={doc.id} versionId={current.id} />
            </div>
          ) : (
            <Alert tone="success">{myAck ? `You acknowledged ${current.version_label} on ${formatDate(myAck.acknowledged_at)}.` : "You have acknowledged an earlier issue. This revision does not ask for renewed acknowledgement."}</Alert>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Details">
            <DescriptionList items={[
              { label: "Reference", value: doc.reference },
              { label: "Category", value: cat?.name },
              { label: "Owner", value: owner },
              { label: "Access", value: classificationLabel(doc.classification) },
              { label: "Current version", value: current?.version_label },
              { label: "Status", value: current ? label(current.status) : "Not yet published" },
              { label: "Published", value: current?.published_at ? formatDate(current.published_at) : null },
              {
                label: "Review by", value: doc.review_on || manager ? (
                  <span className="flex flex-wrap items-center gap-2">
                    {doc.review_on ? <span className={doc.review_on <= today ? "font-medium text-warning-800" : ""}>{formatDate(doc.review_on)}{doc.review_on <= today ? " (review due)" : ""}</span> : <span className="text-muted">Not set</span>}
                    {manager && <ReviewDateForm documentId={doc.id} reviewOn={doc.review_on} />}
                  </span>
                ) : null,
              },
              { label: "Acknowledgement", value: doc.requires_ack ? (doc.renew_ack_on_revision ? "Required for each new issue" : "Required once") : "Not required" },
            ]} />
          </Panel>

          <Panel title="Revision history" padded={false} description={manager ? "Drafts and versions in review are visible only to library managers." : undefined}>
            {versions?.length ? (
              <Table className="rounded-none border-0">
                <THead><TH>Version</TH><TH>Status</TH><TH className="hidden md:table-cell">File</TH><TH className="hidden md:table-cell">Dates</TH>{(manager || approver) && <TH>Actions</TH>}</THead>
                <TBody>
                  {versions.map((v) => (
                    <TR key={v.id}>
                      <TD>
                        <span className="font-medium">{v.version_label}</span>
                        {v.change_summary && <div className="max-w-xs text-[13px] text-muted">{v.change_summary}</div>}
                        {v.status === "draft" && v.review_note && <div className="mt-1 max-w-xs text-[13px] text-warning-800">Returned: {v.review_note}</div>}
                      </TD>
                      <TD><Badge tone={statusTone(v.status)}>{label(v.status)}</Badge></TD>
                      <TD className="hidden md:table-cell">
                        {v.storage_path ? <a className="text-navy-800 underline" href={`/api/documents/${v.id}`}>{v.file_name ?? "Download"}</a> : <span className="text-muted">No file yet</span>}
                        {v.size_bytes ? <div className="text-[13px] text-muted">{sizeLabel(v.size_bytes)}</div> : null}
                      </TD>
                      <TD className="hidden text-[13px] text-muted md:table-cell">
                        <div>Created {formatDate(v.created_at)}</div>
                        {v.published_at && <div>Published {formatDate(v.published_at)}</div>}
                      </TD>
                      {(manager || approver) && (
                        <TD>
                          <div className="flex flex-wrap gap-2">
                            {manager && v.status === "draft" && <UploadVersionForm documentId={doc.id} versionId={v.id} trigger={v.storage_path ? "Replace file" : "Upload file"} />}
                            {manager && v.status === "draft" && v.storage_path && <VersionAction documentId={doc.id} versionId={v.id} to="review" variant="primary">Submit for review</VersionAction>}
                            {v.status === "review" && approver && <ApproveVersionForm documentId={doc.id} versionId={v.id} />}
                            {v.status === "review" && <ReturnVersionForm documentId={doc.id} versionId={v.id} />}
                            {v.status === "approved" && approver && <VersionAction documentId={doc.id} versionId={v.id} to="published" variant="teal" confirm={current ? `Publish ${v.version_label}? ${current.version_label} will be superseded.` : undefined}>Publish</VersionAction>}
                            {["published", "superseded", "approved"].includes(v.status) && approver && <VersionAction documentId={doc.id} versionId={v.id} to="archived" confirm={v.status === "published" ? "Archive the current issue? Readers will no longer see this document until another version is published." : "Archive this version?"}>Archive</VersionAction>}
                          </div>
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <div className="p-5"><EmptyState title="No versions yet">{manager ? "Upload the first draft to begin the approval process." : "This document has not been published."}</EmptyState></div>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Approval history">
            {history.length ? <Timeline items={history} /> : <p className="text-sm text-muted">No history yet.</p>}
          </Panel>
          {manager && doc.requires_ack && current && (
            <Panel title={`Acknowledged ${current.version_label}`} description={`${acks?.length ?? 0} ${acks?.length === 1 ? "person has" : "people have"} acknowledged this issue.`}>
              {acks?.length ? (
                <ul className="max-h-80 space-y-1.5 overflow-y-auto text-sm">
                  {acks.map((a) => <li key={a.person_id} className="flex justify-between gap-3"><span>{(a.persons as unknown as { display_name: string } | null)?.display_name ?? "Former member"}</span><span className="text-muted">{formatDate(a.acknowledged_at)}</span></li>)}
                </ul>
              ) : <p className="text-sm text-muted">No acknowledgements yet.</p>}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
