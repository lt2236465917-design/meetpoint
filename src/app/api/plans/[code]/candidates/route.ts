import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { verifyManagementTokenForPlan } from "@/lib/security/management-token";
import { candidateCityInputSchema } from "@/lib/validation/schemas";

function getManagementToken(req: Request): string | null {
  return req.headers.get("x-management-token");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const verified = await verifyManagementTokenForPlan(
    code,
    getManagementToken(req),
  );

  if (!verified.ok) {
    return NextResponse.json(
      { error: verified.error },
      { status: verified.status },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = candidateCityInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const source = parsed.data.enabled ? "manual_add" : "manual_exclude";
  const { error } = await supabase.from("candidate_cities").upsert(
    {
      plan_id: verified.planId,
      city_code: parsed.data.cityCode,
      city_name: parsed.data.cityName,
      source,
      enabled: parsed.data.enabled,
    },
    { onConflict: "plan_id,city_code,source" },
  );

  if (error) {
    console.error("save candidate city error", error);
    return NextResponse.json(
      { error: "SAVE_CANDIDATE_FAILED" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
