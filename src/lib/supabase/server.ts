import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

export function hasSupabaseEnvironment(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function createServiceSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing server Supabase environment variables");
  }

  // Explicit ws transport keeps service clients working on Node < 22 and is fine on Node 22+.
  // The service-role client is polling/RPC only — Realtime is unused but still constructed.
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
    realtime: {
      // realtime-js WebSocketLike typing lags the accepted constructor shape.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transport: WebSocket as any,
    },
  });
}
