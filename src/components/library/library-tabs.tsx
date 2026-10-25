import { Tabs } from "@/components/ui/layout";
import type { SessionContext } from "@/server/session";

export function LibraryTabs({ session, current, pending }: { session: SessionContext; current: "documents" | "knowledge" | "approvals"; pending?: number }) {
  const has = (p: string) => session.permissions.has(p);
  const tabs = [
    ...(has("docs.read.internal") || has("docs.manage") ? [{ key: "documents", label: "Documents", href: "/library" }] : []),
    { key: "knowledge", label: "Knowledge base", href: "/library/knowledge" },
    ...(has("docs.approve") ? [{ key: "approvals", label: "Approvals", href: "/library/approvals", count: pending || undefined }] : []),
  ];
  return <Tabs tabs={tabs} current={current} />;
}
