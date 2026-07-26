import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { Client } from "pg";

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const FORBIDDEN_DATABASES = new Set(["postgres", "template0", "template1"]);

function testDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("TEST_DATABASE_URL is required");

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("TEST_DATABASE_URL must use PostgreSQL");
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error("TEST_DATABASE_URL must target localhost");
  }
  if (!database.endsWith("_test") || FORBIDDEN_DATABASES.has(database)) {
    throw new Error("TEST_DATABASE_URL database name must end in _test");
  }
  return raw;
}

export async function connectTestDatabase(): Promise<Client> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  const result = await client.query<{ database_name: string }>(
    "select current_database() as database_name",
  );
  const databaseName = result.rows[0]?.database_name;
  if (!databaseName?.endsWith("_test") || FORBIDDEN_DATABASES.has(databaseName)) {
    await client.end();
    throw new Error("Connected database is not a disposable test database");
  }
  return client;
}

async function bootstrapRoles(client: Client): Promise<void> {
  await client.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
      end if;
    end;
    $$;
    grant anon, authenticated, service_role to current_user;
  `);
}

async function grantServiceRoleDataAccess(client: Client): Promise<void> {
  await client.query(`
    grant all privileges on all tables in schema public to service_role;
    grant all privileges on all sequences in schema public to service_role;
  `);
}

async function bootstrapSupabasePublication(client: Client): Promise<void> {
  const existing = await client.query(
    "select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'",
  );
  if (existing.rowCount === 0) {
    await client.query("create publication supabase_realtime");
  }
}

export async function resetCanonicalDatabase(client: Client): Promise<void> {
  await bootstrapRoles(client);
  await client.query("drop schema if exists public cascade");
  await client.query("create schema public authorization current_user");
  await client.query("grant usage, create on schema public to public");
  const schema = await readFile("supabase/schema.sql", "utf8");
  await client.query(schema);
  await grantServiceRoleDataAccess(client);
}

export async function resetThroughMigration(
  client: Client,
  lastMigration: string,
): Promise<void> {
  await bootstrapRoles(client);
  await bootstrapSupabasePublication(client);
  await client.query("drop schema if exists public cascade");
  await client.query("create schema public authorization current_user");
  await client.query("grant usage, create on schema public to public");
  const directory = "supabase/migrations";
  const migrations = (await readdir(directory))
    .filter((name) => name.endsWith(".sql") && name <= lastMigration)
    .sort();
  for (const migration of migrations) {
    await client.query(await readFile(path.join(directory, migration), "utf8"));
  }
  await grantServiceRoleDataAccess(client);
}

export async function applyMigration(client: Client, migration: string): Promise<void> {
  const sql = await readFile(path.join("supabase/migrations", migration), "utf8");
  await client.query(sql);
}
