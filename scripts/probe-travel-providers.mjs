import { execFile as execFileCallback } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
const require = createRequire(import.meta.url);

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

function rowsFromProviderOutput(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed?.results)) {
    return parsed.results;
  }
  if (Array.isArray(parsed?.data?.itemList)) {
    return parsed.data.itemList;
  }
  if (parsed?.tool || parsed?.arguments) {
    return null;
  }
  return [];
}

export function resolveProbeTravelDate(now = new Date()) {
  if (process.env.PROBE_TRAVEL_DATE) {
    return process.env.PROBE_TRAVEL_DATE;
  }

  const date = new Date(now.getTime());
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function classifyFailure(error) {
  if (error?.name === "AbortError" || error?.code === "ABORT_ERR" || error?.code === "ETIMEDOUT" || error?.killed === true) {
    return "provider_timeout";
  }
  if (error instanceof SyntaxError) {
    return "provider_invalid_response";
  }
  return "provider_unavailable";
}

export function resolveFlyAIProbeExecutable() {
  if (process.env.FLYAI_PROBE_CLI_PATH) {
    return process.env.FLYAI_PROBE_CLI_PATH;
  }

  const packageJson = require.resolve("@fly-ai/flyai-cli/package.json", {
    paths: [path.resolve("services/travel-provider-gateway")],
  });
  return path.join(path.dirname(packageJson), "dist", "flyai-bundle.cjs");
}

export async function probeFlyAI({ exec = execFile } = {}) {
  if (!process.env.FLYAI_API_KEY) {
    return summarizeFailure("flyai", "missing_credentials");
  }

  const startedAt = Date.now();
  try {
    const executable = resolveFlyAIProbeExecutable();
    const { stdout } = await exec(executable, [
      "search-train", "--origin", "北京", "--destination", "上海",
      "--dep-date", resolveProbeTravelDate(), "--journey-type", "1", "--sort-type", "3",
    ], { shell: false, timeout: 12_000, maxBuffer: 1_000_000 });
    const parsed = JSON.parse(stdout.trim());
    const rows = rowsFromProviderOutput(parsed);
    if (rows === null) {
      return summarizeFailure("flyai", "provider_unconfigured", Date.now() - startedAt);
    }
    return summarizeProbeResult(
      "flyai",
      Date.now() - startedAt,
      rows,
    );
  } catch (error) {
    return summarizeFailure("flyai", classifyFailure(error), Date.now() - startedAt);
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
    if (!response.ok) return summarizeFailure("amap", "provider_unavailable", Date.now() - startedAt);
    const parsed = await response.json();
    if (parsed.status !== "1") return summarizeFailure("amap", "provider_rejected", Date.now() - startedAt);
    return summarizeProbeResult("amap", Date.now() - startedAt, parsed.districts ?? []);
  } catch (error) {
    return summarizeFailure("amap", classifyFailure(error), Date.now() - startedAt);
  }
}

async function main() {
  const results = await Promise.all([probeAmap(), probeFlyAI()]);
  process.stdout.write(`${JSON.stringify(results)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
