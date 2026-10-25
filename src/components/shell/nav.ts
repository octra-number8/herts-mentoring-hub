import type { Permission } from "@/lib/permissions";
import type { SessionContext } from "@/server/session";

export type NavItem = { href: string; label: string; any: Permission[]; match?: string[] };

/** Provincial management navigation (brief 27.1). Items appear only with permission. */
export const MANAGEMENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", any: ["dashboard.view"] },
  { href: "/lodges", label: "Lodges", any: ["lodges.read"], match: ["/lodges", "/allocations"] },
  { href: "/members", label: "Members", any: ["members.read.basic"] },
  { href: "/support", label: "Support", any: ["cases.read.all", "cases.read.allocated", "cases.confidential.triage", "cases.confidential.submit"] },
  { href: "/tasks", label: "Tasks", any: ["tasks.use"] },
  { href: "/team", label: "Team", any: ["team.use"] },
  { href: "/learning", label: "Academy", any: ["academy.admin", "learning.records.read", "academy.publish", "academy.review"] },
  { href: "/events", label: "Events", any: ["events.read.internal", "events.manage"], match: ["/events", "/calendar"] },
  { href: "/communications", label: "Communications", any: ["comms.use"] },
  { href: "/library", label: "Library", any: ["docs.read.internal", "docs.manage", "knowledge.manage"] },
  { href: "/reports", label: "Reports", any: ["reports.read", "reports.quarterly"] },
  { href: "/imports", label: "Imports", any: ["imports.run"] },
  { href: "/admin", label: "Administration", any: ["admin.users", "admin.roles", "admin.features", "admin.config", "admin.audit", "system.health", "allocations.manage", "workflows.manage"] },
];

/** Learner navigation (brief 27.2). */
export const ACADEMY_NAV: NavItem[] = [
  { href: "/academy", label: "My Learning", any: ["academy.learn"] },
  { href: "/academy/courses", label: "Courses", any: ["academy.learn"] },
  { href: "/academy/progress", label: "My Progress", any: ["academy.learn"] },
  { href: "/academy/certificates", label: "My Certificates", any: ["academy.learn"] },
  { href: "/academy/plan", label: "My Plan", any: ["academy.learn"] },
  { href: "/academy/events", label: "Training Events", any: ["academy.learn"] },
  { href: "/academy/resources", label: "Resources", any: ["academy.learn", "docs.read.mentors"] },
  { href: "/academy/author", label: "Authoring", any: ["academy.author"] },
  { href: "/account", label: "My Account", any: [] },
];

export const visibleNav = (items: NavItem[], s: SessionContext) =>
  items.filter((i) => i.any.length === 0 || i.any.some((p) => s.permissions.has(p)));
