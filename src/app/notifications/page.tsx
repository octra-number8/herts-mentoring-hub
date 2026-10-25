import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, PageHeader, Tabs } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/table";
import { cn, formatDateTime, relativeDays } from "@/lib/utils";
import { NOTIFICATION_TYPES } from "@/server/comms/notification-types";
import { requireSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { MarkAllRead, OpenButton, ReadToggle } from "./notification-buttons";

export const metadata: Metadata = { title: "Notifications" };

const PAGE = 50;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ show?: string; page?: string }> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const show = sp.show === "all" ? "all" : "unread";
  const page = Math.max(1, Number(sp.page) || 1);
  const db = await supabaseServer();
  let q = db.from("notifications").select("id, type, title, body, link, essential, read_at, created_at", { count: "exact" })
    .eq("account_id", session.accountId).order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (show === "unread") q = q.is("read_at", null);
  const [{ data: items, count }, { count: unread }] = await Promise.all([
    q,
    db.from("notifications").select("id", { count: "exact", head: true }).eq("account_id", session.accountId).is("read_at", null),
  ]);
  const typeLabel = (t: string) => NOTIFICATION_TYPES.find((n) => n.type === t)?.label ?? "Notice";

  return (
    <>
      <PageHeader title="Notifications" description="Updates about your work and learning. Choose how you receive each kind in your settings."
        actions={<>{(unread ?? 0) > 0 && <MarkAllRead />}<LinkButton href="/account/notifications">Settings</LinkButton></>} />
      <Tabs current={show} tabs={[
        { key: "unread", label: "Unread", href: "/notifications", count: unread ?? 0 },
        { key: "all", label: "All", href: "/notifications?show=all" },
      ]} />
      {!items?.length ? (
        <EmptyState title={show === "unread" ? "You're all caught up" : "No notifications yet"}>
          {show === "unread" ? <Link href="/notifications?show=all" className="underline">See earlier notifications</Link> : "Notifications appear here when something needs your attention."}
        </EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {items.map((n) => (
              <li key={n.id} className={cn("flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5", !n.read_at && "bg-navy-50/60")}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                    {!n.read_at && <Badge tone="navy">New</Badge>}
                    <span>{typeLabel(n.type)}</span>
                    <span aria-hidden>·</span>
                    <time dateTime={n.created_at} title={formatDateTime(n.created_at)}>{relativeDays(n.created_at)}</time>
                  </div>
                  <p className={cn("mt-0.5 text-ink", !n.read_at && "font-semibold")}>{n.title}</p>
                  {n.body && <p className="text-sm text-slate-ink">{n.body}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {n.link && <OpenButton id={n.id} />}
                  <ReadToggle id={n.id} read={!!n.read_at} />
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE} total={count ?? 0} href={(p) => `/notifications?${show === "all" ? "show=all&" : ""}page=${p}`} />
        </>
      )}
    </>
  );
}
