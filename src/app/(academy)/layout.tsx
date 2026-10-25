import { AcademyShell } from "@/components/shell/academy-shell";
import { requireSession } from "@/server/session";

export default async function AcademyLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return <AcademyShell session={session}>{children}</AcademyShell>;
}
