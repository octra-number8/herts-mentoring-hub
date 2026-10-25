import type { Metadata } from "next";
import { ProfileForm } from "@/components/academy/learner-forms";
import { PageHeader, Panel } from "@/components/ui/layout";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { saveLearnerProfile } from "../actions";

export const metadata: Metadata = { title: "Learning preferences" };

export default async function LearnerProfilePage() {
  const session = await requirePermission("academy.learn");
  const db = await supabaseServer();
  const { data: profile } = await db.from("learner_profiles").select("audiences, masonic_stage, interests").eq("person_id", session.personId).maybeSingle();
  return (
    <>
      <PageHeader breadcrumbs={[{ href: "/academy", label: "My Learning" }]} title="Learning preferences"
        description="Tell us a little about yourself so we can suggest the most useful courses. Your Hub roles are taken into account too." />
      <Panel className="max-w-2xl"><ProfileForm action={saveLearnerProfile} profile={profile ?? null} /></Panel>
    </>
  );
}
