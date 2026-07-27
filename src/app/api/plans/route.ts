import { NextResponse } from "next/server";
import { networkInterfaces } from "os";
import { createFallbackPlan } from "@/lib/fallback/mvp-store";
import {
  createServiceSupabaseClient,
  hasSupabaseEnvironment,
} from "@/lib/supabase/server";
import { createPlanSchema } from "@/lib/validation/schemas";
import { generateToken, hashToken } from "@/lib/security/tokens";

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const MAX_PLAN_CODE_ATTEMPTS = 5;

function isPlanCodeCollision(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const context = `${String(record.message ?? "")} ${String(record.details ?? "")}`;
  return record.code === "23505"
    && (context.includes("plans_code_key") || context.includes("Key (code)"));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = createPlanSchema().safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  if (!hasSupabaseEnvironment()) {
    try {
      const result = await createFallbackPlan(parsed.data);
      return NextResponse.json({
        ...result,
        shareUrl: createShareUrl(req, result.code),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "PLAN_CODE_EXHAUSTED") {
        return NextResponse.json(
          { error: "PLAN_CODE_EXHAUSTED" },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: "CREATE_PLAN_FAILED" }, { status: 500 });
    }
  }

  const supabase = createServiceSupabaseClient();
  const hostToken = generateToken();
  const hostTokenHash = await hashToken(hostToken);
  for (let attempt = 0; attempt < MAX_PLAN_CODE_ATTEMPTS; attempt += 1) {
    const code = generateCode();
    const { data: planId, error } = await supabase.rpc(
      "create_plan_with_host_credential",
      {
        p_code: code,
        p_title: parsed.data.title,
        p_meeting_date: parsed.data.arrivalDate,
        p_participant_limit: parsed.data.participantLimit,
        p_host_token_hash: hostTokenHash,
      },
    );
    if (!error && planId) {
      return NextResponse.json({
        code,
        shareUrl: createShareUrl(req, code),
        hostToken,
      });
    }
    if (!isPlanCodeCollision(error)) {
      return NextResponse.json(
        { error: "CREATE_PLAN_FAILED" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: "PLAN_CODE_EXHAUSTED" },
    { status: 503 },
  );
}

function createShareUrl(req: Request, code: string): string {
  const host = req.headers.get("host");
  if (!host) return `/p/${code}`;

  const [hostname, port] = host.split(":");
  if (!isLocalhost(hostname)) {
    const protocol = req.headers.get("x-forwarded-proto") ?? "http";
    return `${protocol}://${host}/p/${code}`;
  }

  const lanAddress = getLanAddress();
  if (!lanAddress) return `/p/${code}`;
  return `http://${lanAddress}${port ? `:${port}` : ""}/p/${code}`;
}

function isLocalhost(hostname: string | undefined): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function getLanAddress(): string | null {
  for (const networks of Object.values(networkInterfaces())) {
    for (const network of networks ?? []) {
      if (network.family === "IPv4" && !network.internal) {
        return network.address;
      }
    }
  }

  return null;
}
