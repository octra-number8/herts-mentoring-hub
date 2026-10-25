import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/layout";
import type { Permission } from "@/lib/permissions";
import { canAny, requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Administration" };

const SECTIONS: { href: string; title: string; description: string; any: Permission[] }[] = [
  { href: "/admin/users", title: "Users", description: "Invite people, manage accounts, roles and individual permissions.", any: ["admin.users", "admin.roles"] },
  { href: "/admin/roles", title: "Roles and permissions", description: "What each role can do, and which roles need two-step verification.", any: ["admin.roles", "admin.users"] },
  { href: "/admin/features", title: "Feature activation", description: "Modules, their actions, and the Lodge Mentor portal.", any: ["admin.features"] },
  { href: "/admin/config", title: "Configuration", description: "Mentoring statuses, categories, Province settings and Lodge fields.", any: ["admin.config"] },
  { href: "/allocations", title: "Allocations", description: "Which Assistant looks after each Lodge, cover and workloads.", any: ["allocations.manage"] },
  { href: "/admin/workflows", title: "Workflows", description: "Controlled automation from an approved catalogue.", any: ["workflows.manage"] },
  { href: "/admin/audit", title: "Audit log", description: "Who did what and when, with CSV export.", any: ["admin.audit"] },
  { href: "/admin/health", title: "System health", description: "Integrations, email, background jobs and failures.", any: ["system.health"] },
  { href: "/admin/retention", title: "Retention", description: "How long records are kept, with dry runs.", any: ["admin.config", "system.health"] },
];

export default async function AdminPage() {
  const session = await requirePermission("admin.users", "admin.roles", "admin.features", "admin.config", "admin.audit", "system.health", "allocations.manage", "workflows.manage");
  const visible = SECTIONS.filter((s) => canAny(session, s.any));
  return (
    <>
      <PageHeader title="Administration" description="Keeping the Hub running. Technical administration never needs access to confidential mentoring records." />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="block h-full rounded-lg border border-line bg-surface p-5 hover:border-navy-600">
              <span className="block font-semibold text-navy-900">{s.title}</span>
              <span className="mt-1 block text-sm text-muted">{s.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
