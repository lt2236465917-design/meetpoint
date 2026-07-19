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

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = createPlanSchema().safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  if (!hasSupabaseEnvironment()) {
    const result = await createFallbackPlan(parsed.data);
    return NextResponse.json({
      ...result,
      shareUrl: createShareUrl(req, result.code),
    });
  }

  const supabase = createServiceSupabaseClient();
  const code = generateCode();
  const hostToken = generateToken();

  const { data: planId, error } = await supabase.rpc(
    "create_plan_with_host_credential",
    {
      p_code: code,
      p_title: parsed.data.title,
      p_meeting_date: parsed.data.arrivalDate,
      p_participant_limit: parsed.data.participantLimit,
      p_host_token_hash: await hashToken(hostToken),
    },
  );

  if (error || !planId) {
    return NextResponse.json(
      { error: "CREATE_PLAN_FAILED" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    code,
    shareUrl: createShareUrl(req, code),
    hostToken,
  });
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
