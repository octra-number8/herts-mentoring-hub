import { PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/server/session";

export default async function DashboardPage() {
  const s = await requirePermission("dashboard.view");
  return <PageHeader title={`Good day, ${s.firstName}`} description="Provincial dashboard" />;
}
