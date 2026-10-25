import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EditCourseForm } from "@/components/academy/author-forms";
import { LevelBadge } from "@/components/academy/ui";
import { Badge, statusTone } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/dialog-form";
import { DescriptionList, PageHeader, Panel } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate, label } from "@/lib/utils";
import { audienceLabel, minutesLabel, STAGES } from "@/server/academy/content";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { startNewVersion, updateCourse } from "../../actions";

export const metadata: Metadata = { title: "Course authoring" };

export default async function AuthorCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  await requirePermission("academy.author");
  const { courseId } = await params;
  const db = await supabaseServer();
  const { data: course } = await db.from("courses")
    .select("id, slug, title, summary, audiences, masonic_stages, topics, level, principle, estimated_minutes, is_placeholder_content, published_version_id, archived_at")
    .eq("id", courseId).maybeSingle();
  if (!course) notFound();
  const { data: versions } = await db.from("course_versions")
    .select("id, version_no, status, title, change_summary, review_note, created_at, submitted_at, approved_at, published_at")
    .eq("course_id", courseId).order("version_no", { ascending: false });
  const inPreparation = (versions ?? []).find((v) => ["draft", "review", "approved"].includes(v.status));

  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/academy/author", label: "Authoring" }]} title={course.title} description={course.summary}
        meta={<><LevelBadge level={course.level} />{course.is_placeholder_content && <Badge>Sample content</Badge>}{course.archived_at && <Badge>Archived</Badge>}</>}
        actions={<>
          {course.published_version_id && <Link href={`/academy/courses/${course.slug}`} className="text-sm font-medium text-navy-800 underline">View as a learner</Link>}
          {inPreparation
            ? <Link href={`/academy/author/versions/${inPreparation.id}`} className="inline-flex h-10 items-center rounded-md bg-navy-800 px-4 font-medium text-white hover:bg-navy-900">Open version {inPreparation.version_no} ({label(inPreparation.status)})</Link>
            : <ActionButton action={startNewVersion} fields={{ course_id: course.id }} variant="primary" size="md">Start a new version</ActionButton>}
        </>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Versions" className="lg:col-span-2" padded={false}
          description="Learners stay on the version they enrolled in, so completions remain valid when a course is revised.">
          <Table className="rounded-none border-0" caption="Versions">
            <THead><TH>Version</TH><TH>Status</TH><TH className="hidden md:table-cell">Changes</TH><TH className="hidden md:table-cell">Dates</TH></THead>
            <TBody>
              {(versions ?? []).map((v) => (
                <TR key={v.id}>
                  <TD><RowLink href={`/academy/author/versions/${v.id}`}>Version {v.version_no}</RowLink></TD>
                  <TD><Badge tone={statusTone(v.status)}>{label(v.status)}</Badge>{v.review_note && v.status === "draft" && <div className="mt-1 max-w-xs text-[13px] text-warning-800">Reviewer: {v.review_note}</div>}</TD>
                  <TD className="hidden max-w-sm text-[13px] text-slate-ink md:table-cell">{v.change_summary}</TD>
                  <TD className="hidden text-[13px] text-muted md:table-cell">
                    Created {formatDate(v.created_at)}
                    {v.published_at && <div>Published {formatDate(v.published_at)}</div>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Panel>
        <Panel title="Course details" actions={<EditCourseForm action={updateCourse} course={course} />}>
          <DescriptionList columns={1} items={[
            { label: "Web address", value: `/academy/courses/${course.slug}` },
            { label: "Audiences", value: course.audiences.map(audienceLabel).join(", ") },
            { label: "Stages", value: course.masonic_stages.map((s) => STAGES.find((x) => x.value === s)?.label ?? s).join(", ") },
            { label: "Principle", value: label(course.principle) },
            { label: "Topics", value: course.topics.join(", ") },
            { label: "Estimated time", value: minutesLabel(course.estimated_minutes) },
          ]} />
        </Panel>
      </div>
    </>
  );
}
