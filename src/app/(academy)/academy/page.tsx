import { PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/server/session";

export default async function AcademyHome() {
  const s = await requirePermission("academy.learn", "academy.author");
  return <PageHeader title={`Welcome, ${s.firstName}`} description="Your learning" />;
}
