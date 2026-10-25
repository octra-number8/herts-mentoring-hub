import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/layout";
import { formatDate } from "@/lib/utils";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "My Certificates" };

const KIND: Record<string, string> = { course: "Course completion", event: "Training attendance", pathway: "Pathway completion", recognition: "Recognition" };

export default async function CertificatesPage() {
  const session = await requirePermission("academy.learn");
  const db = await supabaseServer();
  const { data: certs } = await db.from("certificates").select("id, kind, title, reference, completed_on, recognition_reason, courses(slug)")
    .eq("person_id", session.personId).is("revoked_at", null).order("completed_on", { ascending: false });

  return (
    <>
      <PageHeader title="My Certificates" description="Download a certificate at any time. Each one carries a unique reference." />
      {!certs?.length ? (
        <EmptyState title="No certificates yet" action={<Link href="/academy/courses" className={buttonClass("primary", "sm")}>Find a course</Link>}>
          When you complete a course or attend training that awards a certificate, it appears here.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {certs.map((c) => {
            const slug = (c.courses as unknown as { slug: string } | null)?.slug;
            return (
              <li key={c.id} className="flex flex-col rounded-xl border border-line bg-white p-5">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-teal-800">{KIND[c.kind] ?? "Certificate"}</p>
                <h2 className="mt-1 text-[17px] font-semibold text-navy-900">{c.title}</h2>
                <p className="mt-1 text-sm text-muted">{formatDate(c.completed_on)} · Reference {c.reference}</p>
                {c.recognition_reason && <p className="mt-2 text-sm text-slate-ink">{c.recognition_reason}</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <a href={`/api/certificates/${c.id}`} className={buttonClass("primary", "sm")}>Download PDF<span className="sr-only"> for {c.title}</span></a>
                  {slug && <Link href={`/academy/courses/${slug}`} className={buttonClass("subtle", "sm")}>View course</Link>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
