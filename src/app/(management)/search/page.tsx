import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel } from "@/components/ui/layout";
import { label } from "@/lib/utils";
import { articleKindLabel } from "@/server/library/documents";
import { requirePermission } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

export const metadata: Metadata = { title: "Search" };

/** Result groups in display order. Every branch of search_all is filtered by RLS as the signed-in user. */
const GROUPS: { kind: string; title: string }[] = [
  { kind: "lodge", title: "Lodges" },
  { kind: "person", title: "People" },
  { kind: "event", title: "Events" },
  { kind: "course", title: "Courses" },
  { kind: "document", title: "Documents" },
  { kind: "article", title: "Knowledge base" },
  { kind: "task", title: "Tasks" },
  { kind: "meeting", title: "Meetings" },
  { kind: "note", title: "Notes" },
  { kind: "case", title: "Support requests" },
];

const SUBTITLE: Record<string, (s: string) => string> = {
  task: label, case: label, article: articleKindLabel,
  note: (s) => `Note on ${({ case: "a support request", person: "a member", lodge: "a Lodge" } as Record<string, string>)[s] ?? "a record"}`,
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePermission("search.management");
  const { q } = await searchParams;
  const term = (q ?? "").trim().slice(0, 100);
  const db = await supabaseServer();
  const { data, error } = term.length >= 2 ? await db.rpc("search_all", { p_query: term, p_limit: 8 }) : { data: [], error: null };
  const results = data ?? [];
  const groups = GROUPS.map((g) => ({ ...g, items: results.filter((r) => r.kind === g.kind) })).filter((g) => g.items.length);

  return (
    <>
      <PageHeader title="Search" description="Results include only what your role allows you to see." />
      <form method="get" role="search" className="mb-6 flex max-w-2xl gap-2">
        <label htmlFor="search-q" className="sr-only">Search the Hub</label>
        <input id="search-q" type="search" name="q" defaultValue={term} autoFocus placeholder="Lodge name or number, a name, an event, a document…"
          className="block w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-100" />
        <button type="submit" className={buttonClass("primary")}>Search</button>
      </form>
      {!term ? (
        <EmptyState title="What are you looking for?">Search Lodges, people, events, courses, documents, knowledge articles, tasks, meetings, notes and support requests.</EmptyState>
      ) : term.length < 2 ? (
        <EmptyState title="Type at least two characters" />
      ) : error ? (
        <EmptyState title="Search is not available just now">Please try again, or use a shorter search.</EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState title={`Nothing found for "${term}"`}>Check the spelling, or try a Lodge number or part of a name.</EmptyState>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted" role="status">{results.length} {results.length === 1 ? "result" : "results"} for &ldquo;{term}&rdquo;. Up to eight are shown in each group.</p>
          <div className="grid gap-5 lg:grid-cols-2">
            {groups.map((g) => (
              <Panel key={g.kind} title={`${g.title} (${g.items.length})`} padded={false}>
                <ul className="divide-y divide-line">
                  {g.items.map((r) => (
                    <li key={`${r.kind}-${r.id}`} className="px-5 py-2.5">
                      <Link href={r.href} className="font-medium text-navy-800 hover:underline">{r.title}</Link>
                      {r.subtitle && <span className="ml-2 text-[13px] text-muted">{(SUBTITLE[r.kind] ?? ((s: string) => s))(r.subtitle)}</span>}
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        </>
      )}
    </>
  );
}
