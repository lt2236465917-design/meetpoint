import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);

export function summarizeProbeResult(provider, latencyMs, rows) {
  return {
    provider,
    status: "ok",
    latencyMs,
    resultCount: rows.length,
    fieldNames: [...new Set(rows.flatMap((row) => Object.keys(row)))].sort(),
  };
}

function summarizeFailure(provider, status, latencyMs = 0) {
  return { provider, status, latencyMs, resultCount: 0, fieldNames: [] };
}

export async function probeFlyAI({ exec = execFile } = {}) {
  if (!process.env.FLYAI_API_KEY) {
    return summarizeFailure("flyai", "missing_credentials");
  }

  const startedAt = Date.now();
  try {
    const executable = process.env.FLYAI_PROBE_CLI_PATH || "flyai";
    const { stdout } = await exec(executable, [
      "search-train", "--origin", "北京", "--destination", "上海",
      "--dep-date", "2026-08-01", "--journey-type", "1", "--sort-type", "3",
    ], { shell: false, timeout: 12_000, maxBuffer: 1_000_000 });
    const parsed = JSON.parse(stdout.trim());
    return summarizeProbeResult(
      "flyai",
      Date.now() - startedAt,
      Array.isArray(parsed) ? parsed : parsed.results ?? [],
    );
  } catch {
    return summarizeFailure("flyai", "probe_failed", Date.now() - startedAt);
  }
}

export async function probeAmap({ fetch: request = globalThis.fetch } = {}) {
  if (!process.env.AMAP_API_KEY) {
    return summarizeFailure("amap", "missing_credentials");
  }

  const startedAt = Date.now();
  try {
    const url = new URL("https://restapi.amap.com/v3/config/district");
    url.searchParams.set("key", process.env.AMAP_API_KEY);
    url.searchParams.set("keywords", "北京");
    url.searchParams.set("subdistrict", "0");
    url.searchParams.set("extensions", "base");
    const response = await request(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return summarizeFailure("amap", "probe_failed", Date.now() - startedAt);
    const parsed = await response.json();
    if (parsed.status !== "1") return summarizeFailure("amap", "provider_rejected", Date.now() - startedAt);
    return summarizeProbeResult("amap", Date.now() - startedAt, parsed.districts ?? []);
  } catch {
    return summarizeFailure("amap", "probe_failed", Date.now() - startedAt);
  }
}

async function main() {
  const results = await Promise.all([probeAmap(), probeFlyAI()]);
  process.stdout.write(`${JSON.stringify(results)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
