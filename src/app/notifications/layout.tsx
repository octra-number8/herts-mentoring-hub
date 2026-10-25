import { AcademyShell } from "@/components/shell/academy-shell";
import { ManagementShell } from "@/components/shell/management-shell";
import { isManagementUser, requireSession } from "@/server/session";

/** /notifications is linked from every header, so it uses whichever shell suits the user. */
export default async function NotificationsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return isManagementUser(session)
    ? <ManagementShell session={session}>{children}</ManagementShell>
    : <AcademyShell session={session}>{children}</AcademyShell>;
}
