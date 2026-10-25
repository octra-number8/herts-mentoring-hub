import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/server/session";

export default async function Home() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.mfaRequired && s.aal !== "aal2") redirect("/mfa");
  redirect(homeFor(s));
}
