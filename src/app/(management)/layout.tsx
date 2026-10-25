import { ManagementShell } from "@/components/shell/management-shell";
import { requirePermission } from "@/server/session";

export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePermission("hub.access_management");
  return <ManagementShell session={session}>{children}</ManagementShell>;
}
