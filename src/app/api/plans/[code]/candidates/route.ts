import { NextResponse } from "next/server";
import {
  readFallbackCandidates,
} from "@/lib/fallback/mvp-store";
import {
  createServiceSupabaseClient,
  hasSupabaseEnvironment,
} from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  if (!hasSupabaseEnvironment()) {
    const candidates = readFallbackCandidates(code);
    if (!candidates) {
      return NextResponse.json({ error: "PLAN_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ candidates });
  }

  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("code", code)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "PLAN_NOT_FOUND" }, { status: 404 });
  }

  const { data } = await supabase
    .from("candidate_cities")
    .select("*")
    .eq("plan_id", plan.id);

  return NextResponse.json({ candidates: data ?? [] });
}

export async function POST() {
  return NextResponse.json(
    { error: "CANDIDATE_EDITING_UNAVAILABLE" },
    { status: 410 },
  );
}
