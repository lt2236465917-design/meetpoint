import { afterEach, describe, expect, it } from "vitest";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

const originalEnv = { ...process.env };

function resetEnv() {
  process.env = { ...originalEnv };
}

describe("Supabase clients", () => {
  afterEach(() => {
    resetEnv();
  });

  it("creates a browser client from public Supabase environment variables", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";

    const client = createBrowserSupabaseClient();

    expect(client.from("plans")).toBeDefined();
  });

  it("fails clearly when browser environment variables are missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(() => createBrowserSupabaseClient()).toThrow(
      "Missing public Supabase environment variables",
    );
  });

  it("creates a service-role client without requiring the public anon key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "server-service-role-key";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const client = createServiceSupabaseClient();

    expect(client.from("plans")).toBeDefined();
  });

  it("fails clearly when server environment variables are missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => createServiceSupabaseClient()).toThrow(
      "Missing server Supabase environment variables",
    );
  });
});
