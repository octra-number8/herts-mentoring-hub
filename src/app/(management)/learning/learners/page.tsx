import type { Metadata } from "next";
import Link from "next/link";
import { EnrolForm } from "@/components/academy/admin-forms";
import { AcademyAdminTabs } from "@/components/academy/admin-tabs";
import { ProgressBar } from "@/components/academy/ui";
import { Badge, statusTone } from "@/components/ui/badge";
import { FilterBar, FilterDate, FilterSearch, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { LEARNING_STATUS, queryLearningRecords, ROLE_LABELS } from "@/server/reports/datasets-learning";
import "@/server/reports/register";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { adminEnrol } from "../actions";

export const metadata: Metadata = { title: "Learning records" };

type Search = { q?: string; lodge?: string; area?: string; role?: string; course?: string; status?: string; from?: string; to?: string };
type Filters = { lodges: { id: string; name: string; number: number }[]; areas: { id: string; name: string }[]; roles: { key: string; name: string }[] };

export default async function LearnersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePermission("learning.records.read");
  const sp = await searchParams;
  const db = await supabaseServer();
  const clean = Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string" && v)) as Record<string, string>;
  const [rows, { data: filterData }, { data: courses }] = await Promise.all([
    queryLearningRecords(db, clean),
    db.rpc("academy_learning_filters"),
    db.from("courses").select("id, title, published_version_id").order("title"),
  ]);
  const filters = (filterData ?? { lodges: [], areas: [], roles: [] }) as unknown as Filters;
  const query = new URLSearchParams(clean).toString();
  const publishedCourses = (courses ?? []).filter((c) => c.published_version_id).map((c) => ({ value: c.id, label: c.title }));
  const learners = new Set(rows.map((r) => r.person_id)).size;

  return (
    <>
      <PageHeader title="Academy" description="Learning records across the Province. Private reflections are never shown here."
        actions={<>
          {can(session, "academy.admin") && <EnrolForm action={adminEnrol} courses={publishedCourses} />}
          {can(session, "reports.export") && (
            <details className="relative">
              <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-md border border-line bg-white px-4 font-medium text-navy-800 hover:border-navy-600">Export</summary>
              <div className="absolute right-0 z-30 mt-1 w-44 rounded-md border border-line bg-white py-1 shadow-lg">
                {(["csv", "xlsx", "pdf"] as const).map((f) => (
                  <a key={f} href={`/api/export/learning?${query}${query ? "&" : ""}format=${f}`} className="block px-4 py-2 text-sm hover:bg-navy-50">{{ csv: "CSV", xlsx: "Excel", pdf: "PDF" }[f]}</a>
                ))}
              </div>
            </details>
          )}
        </>} />
      <AcademyAdminTabs session={session} current="learners" />

      <FilterBar resetHref="/learning/learners">
        <FilterSearch defaultValue={sp.q} placeholder="Learner name" />
        <FilterSelect name="course" label="Course" defaultValue={sp.course} options={(courses ?? []).map((c) => ({ value: c.id, label: c.title }))} />
        <FilterSelect name="status" label="Status" defaultValue={sp.status} options={Object.entries(LEARNING_STATUS).map(([value, label]) => ({ value, label }))} />
        <FilterSelect name="lodge" label="Lodge" defaultValue={sp.lodge} options={filters.lodges.map((l) => ({ value: l.id, label: `${l.name} No. ${l.number}` }))} />
        <FilterSelect name="area" label="Area" defaultValue={sp.area} options={filters.areas.map((a) => ({ value: a.id, label: a.name }))} />
        <FilterSelect name="role" label="Role" defaultValue={sp.role} options={filters.roles.map((r) => ({ value: r.key, label: r.name }))} />
        <FilterDate name="from" label="Active from" defaultValue={sp.from} />
        <FilterDate name="to" label="Active to" defaultValue={sp.to} />
      </FilterBar>

      <p className="mb-3 text-sm text-muted">{rows.length} {rows.length === 1 ? "record" : "records"} · {learners} {learners === 1 ? "learner" : "learners"}. Dates filter on the completion date, or the enrolment date if not yet completed.</p>
      {rows.length === 0 ? (
        <EmptyState title="No learning records match these filters"><Link href="/learning/learners" className="underline">Clear the filters</Link> to see every record.</EmptyState>
      ) : (
        <Table caption="Learning records">
          <THead><TH>Learner</TH><TH>Course</TH><TH>Status</TH><TH className="hidden md:table-cell">Progress</TH><TH className="hidden lg:table-cell">Lodge · Area</TH><TH className="hidden lg:table-cell">Dates</TH></THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.enrolment_id}>
                <TD>
                  <RowLink href={`/learning/learners/${r.person_id}`}>{r.display_name}</RowLink>
                  <div className="text-[13px] text-muted">{(r.roles ?? []).map((k) => ROLE_LABELS[k] ?? k).join(", ")}</div>
                </TD>
                <TD>{r.course_title}{r.version_no > 1 && <span className="text-[13px] text-muted"> · v{r.version_no}</span>}</TD>
                <TD><Badge tone={r.status === "enrolled" ? "navy" : statusTone(r.status)}>{LEARNING_STATUS[r.status] ?? r.status}</Badge>{r.source === "assigned" && <div className="text-[13px] text-muted">Assigned</div>}</TD>
                <TD className="hidden w-48 md:table-cell"><ProgressBar size="sm" value={r.status === "completed" ? 100 : r.lessons_required ? (100 * r.lessons_completed) / r.lessons_required : 0} label={`${r.display_name} progress`} /></TD>
                <TD className="hidden lg:table-cell">{r.lodge_name ? `${r.lodge_name} No. ${r.lodge_number}` : <span className="text-muted">Not recorded</span>}{r.area_name && <div className="text-[13px] text-muted">{r.area_name}</div>}</TD>
                <TD className="hidden text-[13px] lg:table-cell">Enrolled {formatDate(r.enrolled_at)}{r.completed_at && <div>Completed {formatDate(r.completed_at)}</div>}{r.due_on && !r.completed_at && <div className="text-muted">Suggested by {formatDate(r.due_on)}</div>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
