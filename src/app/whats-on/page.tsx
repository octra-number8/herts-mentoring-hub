import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { formatLabel, kindLabel } from "@/components/events/constants";
import { renderMarkdown } from "@/lib/markdown";
import { formatDay, formatTime } from "@/lib/utils";
import { safeBookingUrl } from "@/server/integrations/octra";
import { supabaseService } from "@/server/supabase";

// Always current: never prerendered at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "What's on", description: "Public mentoring events in Hertfordshire" };

/**
 * Public listing (no sign-in). Uses the service role because anonymous visitors
 * have no database access; the query is fixed to published, public, upcoming
 * events and selects only fields that are safe to publish. Joining details,
 * check-in secrets and registrations are never read here.
 */
export default async function WhatsOnPage() {
  const db = supabaseService();
  const { data: events } = await db.from("events")
    .select("id, title, description, kind, format, starts_at, ends_at, location, registration_mode, external_booking_url, meeting_centres(name)")
    .eq("visibility", "public").eq("status", "published").gte("ends_at", new Date().toISOString()).order("starts_at").limit(50);

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <Image src="/brand/shield-256.png" alt="" width={30} height={35} priority />
          <span className="leading-tight">
            <span className="block text-[16px] font-semibold text-navy-900">Hertfordshire Mentoring</span>
            <span className="block text-[12px] text-muted">Prepare · Guide · Support · Enlighten</span>
          </span>
          <Link href="/login" className="ml-auto text-sm font-medium text-navy-800 hover:underline">Sign in</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">What&apos;s on</h1>
        <p className="mt-1 mb-6 max-w-2xl text-muted">Open events from the Hertfordshire mentoring team. Everyone is welcome at the events listed here.</p>
        {!events?.length ? (
          <div className="rounded-md border border-dashed border-line bg-white px-5 py-6">
            <p className="font-medium text-navy-900">No open events are listed at the moment</p>
            <p className="mt-1 text-sm text-muted">Please check back soon.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {events.map((e) => {
              const centre = (e.meeting_centres as unknown as { name: string } | null)?.name;
              const booking = e.registration_mode === "external" ? safeBookingUrl(e.external_booking_url) : null;
              return (
                <li key={e.id} className="rounded-lg border border-line bg-white p-5">
                  <p className="text-[13px] font-medium text-teal-800">{kindLabel(e.kind)} · {formatLabel(e.format)}</p>
                  <h2 className="mt-1 text-lg font-semibold text-navy-900">{e.title}</h2>
                  <p className="text-sm text-slate-ink">{formatDay(e.starts_at)}, {formatTime(e.starts_at)} to {formatTime(e.ends_at)}{centre ? ` · ${centre}` : e.location ? ` · ${e.location}` : ""}</p>
                  {e.description && <div className="prose-hub mt-3 text-sm" dangerouslySetInnerHTML={{ __html: renderMarkdown(e.description) }} />}
                  <div className="mt-4">
                    {booking ? <a href={booking} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "sm")}>Book through Octra-Lodge</a>
                      : e.registration_mode === "hub" ? <Link href={`/login?next=${encodeURIComponent(`/academy/events/${e.id}`)}`} className={buttonClass("secondary", "sm")}>Sign in to book</Link>
                      : <span className="text-sm text-muted">No booking needed.</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
