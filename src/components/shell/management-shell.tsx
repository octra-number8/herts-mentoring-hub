import Image from "next/image";
import Link from "next/link";
import type { SessionContext } from "@/server/session";
import { MANAGEMENT_NAV, visibleNav } from "./nav";
import { MobileMenu, MobileNavList, SideNav } from "./nav-links";
import { EnvironmentBanner, UserMenu } from "./shared";

export function ManagementShell({ session, children }: { session: SessionContext; children: React.ReactNode }) {
  const nav = visibleNav(MANAGEMENT_NAV, session).map(({ href, label, match }) => ({ href, label, match }));
  const canSearch = session.permissions.has("search.management");
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <aside className="hidden bg-navy-800 lg:flex lg:flex-col no-print">
        <Link href="/dashboard" className="flex items-center gap-3 px-5 pb-5 pt-6">
          <Image src="/brand/shield-256.png" alt="" width={34} height={39} priority />
          <span className="leading-tight text-white">
            <span className="block text-[15px] font-semibold">Mentoring Hub</span>
            <span className="block text-[12px] text-navy-100/75">{session.org.short_name}</span>
          </span>
        </Link>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3"><SideNav items={nav} /></nav>
        {session.permissions.has("academy.learn") && (
          <div className="border-t border-white/10 px-3 py-3">
            <Link href="/academy" className="block rounded-md px-3 py-2 text-sm text-navy-100/85 hover:bg-white/8 hover:text-white">My learning</Link>
          </div>
        )}
      </aside>
      <div className="flex min-w-0 flex-col">
        <EnvironmentBanner session={session} />
        <header className="relative flex h-14 items-center gap-3 border-b border-line bg-white px-4 sm:px-6 no-print">
          <div className="flex items-center gap-2 lg:hidden">
            <Image src="/brand/shield-256.png" alt="" width={24} height={28} />
            <MobileMenu><MobileNavList items={[...nav, { href: "/academy", label: "My learning" }]} /></MobileMenu>
          </div>
          {canSearch && (
            <form action="/search" method="get" role="search" className="hidden flex-1 sm:block">
              <label htmlFor="global-search" className="sr-only">Search the Hub</label>
              <input id="global-search" name="q" type="search" placeholder="Search Lodges, people, events, documents…"
                className="h-9 w-full max-w-md rounded-md border border-line bg-canvas px-3 text-sm focus:border-navy-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-100" />
            </form>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Link href="/notifications" className="relative rounded-md px-2.5 py-2 text-sm font-medium text-slate-ink hover:bg-navy-50" aria-label={`Notifications, ${session.unreadNotifications} unread`}>
              Notifications
              {session.unreadNotifications > 0 && <span className="ml-1.5 rounded-full bg-teal-700 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">{session.unreadNotifications}</span>}
            </Link>
            <UserMenu session={session} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <footer className="border-t border-line bg-white px-4 py-4 text-center text-[13px] text-muted no-print sm:px-6 lg:px-8">
          {session.org.name} · Mentoring Hub · <Link href="/privacy" className="underline underline-offset-2 hover:text-navy-900">Privacy notice</Link>
        </footer>
      </div>
    </div>
  );
}
