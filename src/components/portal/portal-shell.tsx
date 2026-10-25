import Image from "next/image";
import Link from "next/link";
import { MobileMenu, MobileNavList, TopNav } from "@/components/shell/nav-links";
import { EnvironmentBanner, UserMenu } from "@/components/shell/shared";
import type { SessionContext } from "@/server/session";

/**
 * The Lodge Mentor portal: a small, separate space for a Lodge Mentor's own
 * Lodge, available only when leadership has activated it. Styled like the Academy.
 */
export function PortalShell({ session, lodges, children }: { session: SessionContext; lodges: { id: string; label: string }[]; children: React.ReactNode }) {
  const nav = [
    ...(lodges.length > 1 ? [{ href: "/portal", label: "My Lodges" }] : []),
    ...lodges.map((l) => ({ href: `/portal/${l.id}`, label: lodges.length > 1 ? l.label : "My Lodge" })),
    { href: "/academy/resources", label: "Mentoring resources" },
  ];
  const extra = [
    { href: "/academy", label: "Academy" },
    ...(session.permissions.has("hub.access_management") ? [{ href: "/dashboard", label: "Provincial Hub" }] : []),
  ];
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <EnvironmentBanner session={session} />
      <header className="relative border-b border-line bg-white no-print">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/portal" className="flex items-center gap-3">
            <Image src="/brand/shield-256.png" alt="" width={30} height={35} priority />
            <span className="leading-tight">
              <span className="block whitespace-nowrap text-[16px] font-semibold text-navy-900">Lodge Mentor portal</span>
              <span className="hidden text-[12px] text-muted sm:block">Prepare · Guide · Support · Enlighten</span>
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
        <nav aria-label="Portal" className="mx-auto hidden max-w-6xl px-4 pb-2 sm:px-6 lg:block"><TopNav items={nav} /></nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t border-line bg-white py-5 text-center text-[13px] text-muted no-print">
        {session.org.name} · Lodge Mentor portal · <Link href="/academy" className="underline">Back to the Academy</Link>
      </footer>
    </div>
  );
}
