import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Alert } from "@/components/ui/layout";
import { renderMarkdown } from "@/lib/markdown";
import { PRIVACY_NOTICE_MARKDOWN, PRIVACY_NOTICE_UPDATED, PRIVACY_NOTICE_VERSION, privacyNoticeIsDraft, privacyNoticePlaceholders } from "@/content/privacy-notice";

export const metadata: Metadata = { title: "Privacy notice", description: "How the Hertfordshire Mentoring Hub uses your information" };

/** Public (no sign-in), linked from every footer and from the screens that collect information. */
export default function PrivacyPage() {
  const draft = privacyNoticeIsDraft();
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <Image src="/brand/shield-256.png" alt="" width={30} height={35} priority />
          <span className="text-[16px] font-semibold text-navy-900">Hertfordshire Mentoring Hub</span>
          <Link href="/login" className="ml-auto text-sm font-medium text-navy-800 hover:underline">Sign in</Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Privacy notice</h1>
        <p className="mt-1 text-sm text-muted">Last updated {PRIVACY_NOTICE_UPDATED} · {PRIVACY_NOTICE_VERSION}</p>
        {draft && (
          <div className="mt-5" data-testid="privacy-draft">
            <Alert tone="warning" title="Draft: not yet approved for use with live information">
              {privacyNoticePlaceholders()} points marked &quot;OWNER TO CONFIRM&quot; must be settled by the Province before this notice is final.
            </Alert>
          </div>
        )}
        <article className="prose-hub mt-6 rounded-lg border border-line bg-white p-6" dangerouslySetInnerHTML={{ __html: renderMarkdown(PRIVACY_NOTICE_MARKDOWN) }} />
      </main>
    </div>
  );
}
