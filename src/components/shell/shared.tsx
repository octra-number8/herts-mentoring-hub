import Link from "next/link";
import type { SessionContext } from "@/server/session";
import { Avatar } from "@/components/ui/layout";

export function EnvironmentBanner({ session }: { session: SessionContext }) {
  const label = (session.org.settings as { environment_label?: string }).environment_label;
  if (!label) return null;
  return <div className="bg-warning-50 px-4 py-1 text-center text-[13px] font-medium text-warning-800 no-print">{label}: not live membership information</div>;
}

export function UserMenu({ session }: { session: SessionContext }) {
  return (
    <details className="relative">
      <summary aria-label={`Account menu for ${session.displayName}`} className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 hover:bg-navy-50 [&::-webkit-details-marker]:hidden">
        <Avatar name={session.displayName} size={30} />
        <span className="hidden text-sm font-medium text-ink md:inline">{session.displayName}</span>
      </summary>
      <div className="absolute right-0 z-40 mt-1 w-56 rounded-md border border-line bg-white py-1 shadow-lg">
        <Link href="/account" className="block px-4 py-2 text-sm hover:bg-navy-50">My account</Link>
        <Link href="/account/notifications" className="block px-4 py-2 text-sm hover:bg-navy-50">Notification settings</Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className="block w-full px-4 py-2 text-left text-sm hover:bg-navy-50">Sign out</button>
        </form>
      </div>
    </details>
  );
}
