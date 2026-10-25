import type { Metadata } from "next";
import Link from "next/link";
import { RecognitionForm, RevokeForm } from "@/components/academy/admin-forms";
import { AcademyAdminTabs } from "@/components/academy/admin-tabs";
import { Badge } from "@/components/ui/badge";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate, label } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { issueRecognition, revokeCertificate } from "../actions";

export const metadata: Metadata = { title: "Certificates" };

export default async function AdminCertificatesPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; state?: string }> }) {
  const session = await requirePermission("learning.records.read");
  const sp = await searchParams;
  const db = await supabaseServer();
  let q = db.from("certificates").select("id, person_id, kind, title, reference, learner_name, completed_on, issued_at, revoked_at, revoked_reason, recognition_reason")
    .order("issued_at", { ascending: false }).limit(500);
  if (sp.q) q = q.or(`learner_name.ilike.%${sp.q.replace(/[%,()*]/g, "")}%,reference.ilike.%${sp.q.replace(/[%,()*]/g, "")}%`);
  if (sp.kind && ["course", "event", "pathway", "recognition"].includes(sp.kind)) q = q.eq("kind", sp.kind);
  if (sp.state === "revoked") q = q.not("revoked_at", "is", null);
  else if (sp.state !== "all") q = q.is("revoked_at", null);
  const [{ data: certs }, { data: courses }] = await Promise.all([q, db.from("courses").select("id, title").order("title")]);
  const isAdmin = can(session, "academy.admin");

  return (
    <>
      <PageHeader title="Academy" description="Certificates are issued automatically on completion. Recognition certificates and revocations are recorded with a reason."
        actions={isAdmin ? <RecognitionForm action={issueRecognition} courses={(courses ?? []).map((c) => ({ value: c.id, label: c.title }))} /> : undefined} />
      <AcademyAdminTabs session={session} current="certificates" />
      <FilterBar resetHref="/learning/certificates">
        <FilterSearch defaultValue={sp.q} placeholder="Learner or reference" />
        <FilterSelect name="kind" label="Kind" defaultValue={sp.kind} options={[{ value: "course", label: "Course" }, { value: "event", label: "Event" }, { value: "pathway", label: "Pathway" }, { value: "recognition", label: "Recognition" }]} />
        <FilterSelect name="state" label="Showing" defaultValue={sp.state} placeholder="Current" options={[{ value: "revoked", label: "Revoked" }, { value: "all", label: "All" }]} />
      </FilterBar>
      {!certs?.length ? <EmptyState title="No certificates match"><Link className="underline" href="/learning/certificates">Clear the filters</Link></EmptyState> : (
        <Table caption="Certificates">
          <THead><TH>Learner</TH><TH>Certificate</TH><TH className="hidden md:table-cell">Reference</TH><TH className="hidden md:table-cell">Date</TH><TH /></THead>
          <TBody>
            {certs.map((c) => (
              <TR key={c.id}>
                <TD><RowLink href={`/learning/learners/${c.person_id}`}>{c.learner_name}</RowLink></TD>
                <TD>
                  <span className={c.revoked_at ? "text-muted line-through" : ""}>{c.title}</span> <Badge tone={c.kind === "recognition" ? "teal" : "neutral"}>{label(c.kind)}</Badge>
                  {c.recognition_reason && <div className="text-[13px] text-muted">{c.recognition_reason}</div>}
                  {c.revoked_at && <div className="text-[13px] text-warning-800">Revoked {formatDate(c.revoked_at)}: {c.revoked_reason}</div>}
                </TD>
                <TD className="hidden tabular-nums md:table-cell">{c.reference}</TD>
                <TD className="hidden md:table-cell">{formatDate(c.completed_on)}</TD>
                <TD>{!c.revoked_at && <span className="flex items-center gap-2"><a className="text-sm font-medium text-navy-800 underline" href={`/api/certificates/${c.id}`}>Download</a>{isAdmin && <RevokeForm action={revokeCertificate} certificateId={c.id} title={c.title} />}</span>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
