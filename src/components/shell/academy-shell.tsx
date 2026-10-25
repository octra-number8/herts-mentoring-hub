import Image from "next/image";
import Link from "next/link";
import type { SessionContext } from "@/server/session";
import { ACADEMY_NAV, visibleNav } from "./nav";
import { MobileMenu, MobileNavList, TopNav } from "./nav-links";
import { EnvironmentBanner, UserMenu } from "./shared";

/** The Herts Mentoring Academy: a separate, simpler experience for learners. */
export function AcademyShell({ session, children }: { session: SessionContext; children: React.ReactNode }) {
  const nav = visibleNav(ACADEMY_NAV, session).map(({ href, label }) => ({ href, label }));
  const extra = [
    ...(session.permissions.has("hub.access_management") ? [{ href: "/dashboard", label: "Provincial Hub" }] : []),
    ...(session.portalLodgeIds.length ? [{ href: "/portal", label: "My Lodge" }] : []),
  ];
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <EnvironmentBanner session={session} />
      <header className="relative border-b border-line bg-white no-print">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/academy" className="flex items-center gap-3">
            <Image src="/brand/shield-256.png" alt="" width={30} height={35} priority />
            <span className="leading-tight">
              <span className="block text-[16px] font-semibold text-navy-900">Herts Mentoring Academy</span>
              <span className="block text-[12px] text-muted">Prepare · Guide · Support · Enlighten</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {extra.map((e) => (
              <Link key={e.href} href={e.href} className="hidden rounded-md px-3 py-2 text-sm font-medium text-navy-800 hover:bg-navy-50 md:block">{e.label}</Link>
            ))}
            <MobileMenu><MobileNavList items={[...nav, ...extra]} /></MobileMenu>
            <UserMenu session={session} />
          </div>
        </div>
        <nav aria-label="Academy" className="mx-auto hidden max-w-6xl px-4 pb-2 sm:px-6 lg:block"><TopNav items={nav} /></nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t border-line bg-white py-5 text-center text-[13px] text-muted no-print">
        {session.org.name} · Herts Mentoring Academy
      </footer>
    </div>
  );
}
