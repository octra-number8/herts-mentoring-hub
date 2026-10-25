import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/ui/filters";
import { EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { ArchiveNoteButton, TeamNoteForm } from "@/components/team/team-forms";
import { formatDateTime } from "@/lib/utils";
import { can, requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";
import { WithAccounts } from "@/components/members/with-accounts";

export const metadata: Metadata = { title: "Team notes" };

type Named = { persons: { display_name: string } | null } | null;

export default async function TeamNotesPage({ searchParams }: { searchParams: Promise<{ q?: string; visibility?: string }> }) {
  const session = await requirePermission("notes.team", "notes.leadership");
  const sp = await searchParams;
  const db = await supabaseServer();

  let q = db.from("notes").select("id, body, visibility, created_at, author_account_id, user_accounts!notes_author_account_id_fkey(persons(display_name))")
    .eq("subject_type", "general").is("archived_at", null).order("created_at", { ascending: false }).limit(200);
  if (sp.visibility === "team" || sp.visibility === "leadership") q = q.eq("visibility", sp.visibility);
  const term = sp.q?.trim().replace(/[%,()*:"\\]/g, "");
  if (term) q = q.ilike("body", `%${term}%`);
  const { data: notes } = await q;

  const visibilities = [
    ...(can(session, "notes.team") ? [{ value: "team", label: "Provincial team" }] : []),
    ...(can(session, "notes.leadership") ? [{ value: "leadership", label: "Leadership only" }] : []),
  ];

  return (
    <WithAccounts>
      <PageHeader breadcrumbs={[{ href: "/team", label: "Team" }]} title="Team notes"
        description="General shared notes for the Provincial team. Notes about a Lodge or Brother belong on their page." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <FilterBar resetHref="/team/notes">
            <FilterSearch defaultValue={sp.q} placeholder="Words in the note" />
            {visibilities.length > 1 && <FilterSelect name="visibility" label="Audience" defaultValue={sp.visibility} options={visibilities} />}
          </FilterBar>
          <Panel>
            {notes?.length ? (
              <ul className="divide-y divide-line">
                {notes.map((n) => (
                  <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
                      <span>
                        <span className="font-medium text-ink">{(n.user_accounts as unknown as Named)?.persons?.display_name ?? "Team member"}</span>
                        {" · "}{formatDateTime(n.created_at)}
                        {n.visibility === "leadership" && <> <Badge tone="navy">Leadership only</Badge></>}
                      </span>
                      {n.author_account_id === session.accountId && <ArchiveNoteButton noteId={n.id} />}
                    </div>
                    <p className="whitespace-pre-line text-sm">{n.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={sp.q || sp.visibility ? "No notes match" : "No team notes yet"}>
                {sp.q || sp.visibility ? <Link href="/team/notes" className="underline">Clear the search</Link> : "Add the first one."}
              </EmptyState>
            )}
          </Panel>
        </div>
        <Panel title="Add a note"><TeamNoteForm visibilities={visibilities} /></Panel>
      </div>
    </WithAccounts>
  );
}
