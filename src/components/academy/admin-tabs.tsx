import { Tabs } from "@/components/ui/layout";
import type { Permission } from "@/lib/permissions";
import type { SessionContext } from "@/server/session";

const TABS: { key: string; label: string; href: string; any: Permission[] }[] = [
  { key: "overview", label: "Overview", href: "/learning", any: ["academy.admin", "learning.records.read", "academy.review", "academy.publish"] },
  { key: "approvals", label: "Approvals", href: "/learning/approvals", any: ["academy.review", "academy.publish"] },
  { key: "learners", label: "Learners", href: "/learning/learners", any: ["learning.records.read"] },
  { key: "certificates", label: "Certificates", href: "/learning/certificates", any: ["learning.records.read"] },
  { key: "pathways", label: "Pathways", href: "/learning/pathways", any: ["academy.publish"] },
  { key: "badges", label: "Badges", href: "/learning/badges", any: ["academy.publish"] },
  { key: "resources", label: "Solomon links", href: "/learning/resources", any: ["academy.publish"] },
  // Authoring lives in the Academy area (shared with L&D contributors); linked here so it can be found.
  { key: "authoring", label: "Course authoring", href: "/academy/author", any: ["academy.author"] },
];

/** Section navigation for Academy administration; tabs follow permissions. */
export function AcademyAdminTabs({ session, current, counts }: { session: SessionContext; current: string; counts?: Record<string, number> }) {
  const tabs = TABS.filter((t) => t.any.some((p) => session.permissions.has(p))).map((t) => ({ key: t.key, label: t.label, href: t.href, count: counts?.[t.key] }));
  return <Tabs tabs={tabs} current={current} />;
}
