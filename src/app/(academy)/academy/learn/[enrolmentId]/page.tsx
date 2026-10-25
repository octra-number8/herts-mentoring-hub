import { notFound, redirect } from "next/navigation";
import { loadOutline, resumeLesson } from "@/server/academy/queries";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

/** Continue where you left off: the first lesson not yet completed. */
export default async function ResumePage({ params }: { params: Promise<{ enrolmentId: string }> }) {
  const session = await requirePermission("academy.learn");
  const { enrolmentId } = await params;
  const db = await supabaseServer();
  const { data: e } = await db.from("enrolments").select("id, person_id, course_version_id, courses(slug)").eq("id", enrolmentId).maybeSingle();
  if (!e || e.person_id !== session.personId) notFound();
  const [outline, { data: progress }] = await Promise.all([
    loadOutline(db, e.course_version_id),
    db.from("lesson_progress").select("lesson_id").eq("enrolment_id", enrolmentId),
  ]);
  const lesson = resumeLesson(outline, new Set((progress ?? []).map((p) => p.lesson_id)));
  if (!lesson) redirect(`/academy/courses/${(e.courses as unknown as { slug: string }).slug}`);
  redirect(`/academy/learn/${enrolmentId}/${lesson.id}`);
}
