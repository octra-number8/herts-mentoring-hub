import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/server/session";
import { supabaseServer } from "@/server/supabase";

/**
 * Evidence for self-declared external learning. The record is read through the
 * user's client (own records, or learning administrators), then the file is
 * served through a short-lived signed URL; storage policies apply the same rule.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.mfaRequired && session.aal !== "aal2")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const db = await supabaseServer();
  const { data: rec } = await db.from("external_learning").select("evidence_path").eq("id", id).maybeSingle();
  if (!rec?.evidence_path) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data } = await db.storage.from("evidence").createSignedUrl(rec.evidence_path, 60);
  if (!data?.signedUrl) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
