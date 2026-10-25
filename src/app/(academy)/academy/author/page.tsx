import type { Metadata } from "next";
import { NewCourseForm } from "@/components/academy/author-forms";
import { LevelBadge } from "@/components/academy/ui";
import { Badge, statusTone } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { RowLink, TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { formatDate, label } from "@/lib/utils";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { createCourse } from "./actions";

export const metadata: Metadata = { title: "Authoring" };

export default async function AuthoringPage() {
  await requirePermission("academy.author");
  const db = await supabaseServer();
  const { data: courses } = await db.from("courses")
    .select("id, slug, title, level, is_placeholder_content, archived_at, updated_at, published_version_id, course_versions!course_versions_course_id_fkey(id, version_no, status, review_note, created_at)")
    .order("title");

  return (
    <>
      <PageHeader title="Authoring" description="Create and improve Academy courses. Every version is reviewed by someone else before it is published."
        actions={<NewCourseForm action={createCourse} />} />
      {!courses?.length ? (
        <EmptyState title="No courses yet">Create the first course to get started.</EmptyState>
      ) : (
        <Table caption="Courses">
          <THead><TH>Course</TH><TH className="hidden md:table-cell">Level</TH><TH>Published</TH><TH>Latest version</TH><TH className="hidden lg:table-cell">Updated</TH></THead>
          <TBody>
            {courses.map((c) => {
              const versions = ((c.course_versions ?? []) as { id: string; version_no: number; status: string; review_note: string | null }[]).sort((a, b) => b.version_no - a.version_no);
              const latest = versions[0];
              const published = versions.find((v) => v.id === c.published_version_id);
              return (
                <TR key={c.id}>
                  <TD>
                    <RowLink href={`/academy/author/courses/${c.id}`}>{c.title}</RowLink>
                    <div className="text-[13px] text-muted">/{c.slug}{c.is_placeholder_content ? " · sample content" : ""}{c.archived_at ? " · archived" : ""}</div>
                  </TD>
                  <TD className="hidden md:table-cell"><LevelBadge level={c.level} /></TD>
                  <TD>{published ? `Version ${published.version_no}` : <span className="text-muted">Not published</span>}</TD>
                  <TD>
                    {latest ? <>
                      <Badge tone={statusTone(latest.status)}>{label(latest.status)}</Badge> <span className="text-[13px] text-muted">v{latest.version_no}</span>
                      {latest.status === "draft" && latest.review_note && <div className="text-[13px] text-warning-800">Returned with a note</div>}
                    </> : null}
                  </TD>
                  <TD className="hidden lg:table-cell">{formatDate(c.updated_at)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}
