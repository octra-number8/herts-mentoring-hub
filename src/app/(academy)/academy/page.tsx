import type { Metadata } from "next";
import Link from "next/link";
import { CourseCard, ProgressBar, SectionHeading } from "@/components/academy/ui";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { formatDate, formatDay, formatTime, label } from "@/lib/utils";
import { loadMyEnrolments } from "@/server/academy/queries";
import { recommendCourses, type RecPathway } from "@/server/academy/recommend";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "My Learning" };

export default async function MyLearningPage() {
  const session = await requirePermission("academy.learn", "academy.author");
  if (!can(session, "academy.learn")) {
    return (
      <PageHeader title={`Welcome, ${session.firstName}`} description="You have access to Academy authoring."
        actions={<Link href="/academy/author" className={buttonClass("primary")}>Go to Authoring</Link>} />
    );
  }
  const db = await supabaseServer();
  const nowIso = new Date().toISOString();

  const [enrolments, { data: courses }, { data: pathways }, { data: profile }, { data: events }, { data: certificates }, { data: badges }, { data: plan }] = await Promise.all([
    loadMyEnrolments(db, session.personId),
    db.from("courses").select("id, slug, title, summary, level, principle, audiences, masonic_stages, topics, estimated_minutes, is_placeholder_content")
      .not("published_version_id", "is", null).is("archived_at", null),
    db.from("pathways").select("id, title, audience, pathway_courses(course_id, requirement, position)").eq("published", true).order("position"),
    db.from("learner_profiles").select("audiences, masonic_stage, interests").eq("person_id", session.personId).maybeSingle(),
    db.from("events").select("id, title, starts_at, format, location").eq("is_training", true).eq("status", "published").gte("starts_at", nowIso).order("starts_at").limit(3),
    db.from("certificates").select("id, title, reference, completed_on").eq("person_id", session.personId).is("revoked_at", null).order("issued_at", { ascending: false }),
    db.from("badge_awards").select("id, awarded_at, badges(name, description)").eq("person_id", session.personId).order("awarded_at", { ascending: false }),
    db.from("development_plans").select("aspirations, development_plan_items(id, title, status, target_on)").eq("person_id", session.personId).maybeSingle(),
  ]);

  const inProgress = enrolments.filter((e) => e.status !== "completed");
  const completed = enrolments.filter((e) => e.status === "completed");
  const continueWith = [...inProgress].filter((e) => e.next)
    .sort((a, b) => (b.last_activity_at ?? b.enrolled_at).localeCompare(a.last_activity_at ?? a.enrolled_at))[0];
  const recommended = recommendCourses({
    courses: courses ?? [],
    pathways: (pathways ?? []).map((p) => ({ ...p, courses: p.pathway_courses ?? [] })) as RecPathway[],
    profile: profile ?? null, roles: session.roles,
    excludeCourseIds: new Set(enrolments.map((e) => e.course.id)), limit: 3,
  });
  const planItems = (plan?.development_plan_items ?? []) as { id: string; title: string; status: string; target_on: string | null }[];
  const openItems = planItems.filter((i) => i.status === "planned" || i.status === "in_progress")
    .sort((a, b) => (a.target_on ?? "9999").localeCompare(b.target_on ?? "9999"));

  return (
    <div className="space-y-10">
      <section className="rounded-2xl bg-navy-800 px-5 py-7 text-white sm:px-8">
        <p className="text-sm font-medium text-teal-100">Prepare · Guide · Support · Enlighten</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome, {session.firstName}</h1>
        <p className="mt-2 max-w-2xl text-navy-100">
          {enrolments.length ? "Good to see you again. Pick up where you left off, or find something new." : "This is your space to learn about mentoring in Hertfordshire, at your own pace. A good place to start is below."}
        </p>
        <dl className="mt-5 grid max-w-lg grid-cols-3 gap-3">
          {([["In progress", inProgress.length], ["Completed", completed.length], ["Certificates", certificates?.length ?? 0]] as const).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-white/10 px-3 py-2">
              <dt className="text-[13px] text-navy-100">{k}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {continueWith && (
        <section aria-labelledby="continue">
          <SectionHeading id="continue" title="Continue learning" />
          <div className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-muted">{continueWith.course.title}</p>
              <p className="text-lg font-semibold text-navy-900">Next: {continueWith.next!.title}</p>
              <ProgressBar value={continueWith.pct} className="mt-2 max-w-md" label={`${continueWith.course.title} progress`} />
            </div>
            <Link href={`/academy/learn/${continueWith.id}/${continueWith.next!.id}`} className={buttonClass("teal")}>Continue</Link>
          </div>
        </section>
      )}

      <section aria-labelledby="mine">
        <SectionHeading id="mine" title="My courses" action={enrolments.length ? <Link href="/academy/progress" className="text-sm font-medium text-navy-800 hover:underline">See all progress</Link> : undefined} />
        {enrolments.length === 0 ? (
          <EmptyState title="You have not started a course yet" action={<Link href="/academy/courses" className={buttonClass("primary", "sm")}>Browse courses</Link>}>
            Courses are short and practical. You can stop at any point and carry on later.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...inProgress, ...completed].slice(0, 6).map((e) => (
              <li key={e.id} className="flex"><div className="flex w-full flex-col"><CourseCard course={e.course} progress={e.pct} status={e.status} reason={e.source === "assigned" ? `Assigned to you${e.due_on ? `, suggested by ${formatDate(e.due_on)}` : ""}` : undefined} /></div></li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recommended">
        <SectionHeading id="recommended" title="Recommended for you" action={<Link href="/academy/profile" className="text-sm font-medium text-navy-800 hover:underline">Tune recommendations</Link>} />
        {recommended.length === 0 ? (
          <EmptyState title="Nothing new to suggest just now">
            {enrolments.length ? "You have started everything we would recommend. " : ""}<Link className="underline" href="/academy/profile">Tell us about your role and interests</Link> or <Link className="underline" href="/academy/courses">browse every course</Link>.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommended.map((c) => <li key={c.id} className="flex"><div className="flex w-full flex-col"><CourseCard course={c} reason={c.reason} /></div></li>)}
          </ul>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="training">
          <SectionHeading id="training" title="Upcoming training" action={<Link href="/academy/events" className="text-sm font-medium text-navy-800 hover:underline">All training events</Link>} />
          {events?.length ? (
            <ul className="divide-y divide-line rounded-xl border border-line bg-white">
              {events.map((e) => (
                <li key={e.id}>
                  <Link href={`/academy/events/${e.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-navy-50">
                    <span className="w-24 shrink-0 text-sm font-semibold text-teal-800">{formatDay(e.starts_at)}</span>
                    <span className="min-w-0">
                      <span className="block font-medium text-navy-900">{e.title}</span>
                      <span className="block text-[13px] text-muted">{formatTime(e.starts_at)} · {e.format === "online" ? "Online" : e.location ?? label(e.format)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No training events coming up">New workshops and evenings appear here as they are announced.</EmptyState>}
        </section>

        <section aria-labelledby="plan">
          <SectionHeading id="plan" title="My development plan" action={<Link href="/academy/plan" className="text-sm font-medium text-navy-800 hover:underline">{plan ? "Open my plan" : "Start a plan"}</Link>} />
          {plan && (plan.aspirations || planItems.length) ? (
            <div className="rounded-xl border border-line bg-white p-5">
              {plan.aspirations && <p className="line-clamp-3 text-sm text-slate-ink">{plan.aspirations}</p>}
              <p className="mt-2 text-sm text-muted">{openItems.length} open {openItems.length === 1 ? "item" : "items"} · {planItems.filter((i) => i.status === "done").length} done</p>
              {openItems.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {openItems.slice(0, 3).map((i) => <li key={i.id} className="flex justify-between gap-2"><span>{i.title}</span>{i.target_on && <span className="shrink-0 text-muted">{formatDate(i.target_on)}</span>}</li>)}
                </ul>
              )}
            </div>
          ) : <EmptyState title="No plan yet">A few lines about what you would like to learn, and some steps to get there, is all it takes.</EmptyState>}
        </section>

        <section aria-labelledby="certs">
          <SectionHeading id="certs" title="Certificates" action={certificates?.length ? <Link href="/academy/certificates" className="text-sm font-medium text-navy-800 hover:underline">All certificates</Link> : undefined} />
          {certificates?.length ? (
            <ul className="divide-y divide-line rounded-xl border border-line bg-white">
              {certificates.slice(0, 3).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <span><span className="block font-medium text-navy-900">{c.title}</span><span className="text-[13px] text-muted">{formatDate(c.completed_on)} · {c.reference}</span></span>
                  <a href={`/api/certificates/${c.id}`} className="text-sm font-medium text-navy-800 underline">Download<span className="sr-only"> {c.title} certificate</span></a>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No certificates yet">Complete a course and your certificate appears here, ready to download.</EmptyState>}
        </section>

        <section aria-labelledby="achievements">
          <SectionHeading id="achievements" title="Achievements" />
          {badges?.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {badges.map((b) => {
                const badge = b.badges as unknown as { name: string; description: string };
                return (
                  <li key={b.id} className="rounded-xl border border-teal-100 bg-teal-50 p-4">
                    <Badge tone="teal">Achievement</Badge>
                    <p className="mt-1.5 font-semibold text-navy-900">{badge.name}</p>
                    <p className="text-sm text-slate-ink">{badge.description}</p>
                    <p className="mt-1 text-[13px] text-muted">Earned {formatDate(b.awarded_at)}</p>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState title="No achievements yet">Achievements mark milestones such as your first completed course or a finished pathway.</EmptyState>}
        </section>
      </div>
    </div>
  );
}
