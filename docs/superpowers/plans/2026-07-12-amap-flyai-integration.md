# Amap And FlyAI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add local-first Amap city validation and an isolated FlyAI travel gateway that supplies honestly labeled real fare snapshots without changing deterministic candidate generation, route selection, scoring, or ranking.

**Architecture:** The Next.js application calls Amap server-side and calls a separately deployable authenticated Node.js travel gateway through a vendor-neutral JSON contract. The gateway invokes FlyAI through an argument-array CLI adapter, validates and caches normalized results, while the application filters same-day feasible routes, falls back to deterministic estimates, persists query timestamps, and keeps DeepSeek post-calculation only.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zod 4, Vitest 4, Supabase/PostgreSQL, Node.js HTTP server, FlyAI CLI/MCP, Amap Web Service API.

## Global Constraints

- Use Chinese for user-facing copy and English for code, files, variables, and commits.
- Update **AGENTS.md** before creating **services/travel-provider-gateway/**.
- Keep candidate generation, route selection, scoring, and ranking deterministic.
- Score one selected route per participant per candidate; do not use average fare as a UI decision metric.
- DeepSeek only explains computed results and never changes candidates, tickets, scores, or ordering.
- The built-in city library remains the scoring source of truth; Amap supplements search and validation for city-level participant input.
- Search only meeting-day departures that arrive no later than the target arrival time.
- Keep mixed real and estimated candidates rankable with estimate penalties and visible source labels.
- Treat provider prices as timestamped references, not locked prices or inventory.
- Keep AMAP_API_KEY in the Next.js server and FLYAI_API_KEY in the gateway only.
- Do not scrape Fliggy or call undocumented internal endpoints.
- Initial limits: Amap timeout 3 seconds; FlyAI timeout 12 seconds; retry count 1; FlyAI concurrency 4; cache TTL 5 minutes; calculation timeout 45 seconds; result staleness 30 minutes.
- Run root and gateway lint, test, and build commands before completion.
- Do not push unless the user explicitly asks.

---

## File Map

- **AGENTS.md**: add gateway structure, secrets, CLI safety, cleanup, and verification rules.
- **scripts/probe-travel-providers.mjs**: redacted capability probe.
- **src/lib/city/amap-client.ts**: timeout-bound Amap client and response validation.
- **src/lib/city/city-provider.ts**: local-first search and local-library mapping.
- **src/types/domain.ts**, **src/lib/travel/types.ts**: query freshness and gateway contracts.
- **supabase/schema.sql** and a migration: persist queried_at.
- **services/travel-provider-gateway/**: isolated contract, FlyAI adapter, cache, limiter, service, HTTP server, tests, and container.
- **src/lib/travel/gateway-client.ts**: strict authenticated gateway client.
- **src/lib/travel/flyai-provider.ts**: real lookup with per-mode estimates on failure.
- **src/lib/recommendation/travel-search.ts**: deduplication, deadline filtering, and total timeout.
- **src/lib/recommendation/calculate-run.ts**, **src/lib/fallback/mvp-store.ts**: shared orchestration and persistence.
- **src/app/p/[code]/result/page.tsx**, **src/components/result/RecommendationCard.tsx**: source, freshness, and safe booking UX.
- **README.md**, **docs/architecture.md**, **docs/integration-guide.md**: stable operations and acceptance knowledge.

---

### Task 1: Establish Rules And A Redacted Provider Gate

**Files:**
- Modify: **AGENTS.md**
- Create: **scripts/probe-travel-providers.mjs**
- Modify: **.env.example**
- Modify: **package.json**
- Test: **tests/provider-probe.test.ts**

**Interfaces:**
- Consumes: AMAP_API_KEY, FLYAI_API_KEY, optional FLYAI_PROBE_CLI_PATH.
- Produces: npm run probe:providers, printing status, latency, result count, and field names only.

- [ ] **Step 1: Write the failing safety test**

~~~ts
import { describe, expect, it } from "vitest";
import { summarizeProbeResult } from "../scripts/probe-travel-providers.mjs";

describe("provider probe", () => {
  it("does not expose payload values", () => {
    const result = summarizeProbeResult("flyai", 123, [{
      price: 599,
      bookingUrl: "https://www.fliggy.com/secret-token",
      flightNo: "MU5101",
    }]);
    expect(result).toEqual({
      provider: "flyai", status: "ok", latencyMs: 123, resultCount: 1,
      fieldNames: ["bookingUrl", "flightNo", "price"],
    });
    expect(JSON.stringify(result)).not.toContain("599");
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });
});
~~~

- [ ] **Step 2: Verify RED**

Run: npm run test -- tests/provider-probe.test.ts

Expected: FAIL because the probe module is absent.

- [ ] **Step 3: Update AGENTS.md before adding the service**

Add exact rules stating that the gateway owns FlyAI credentials, CLI/MCP execution, validation, timeouts, retry, cache, and error mapping; it cannot generate candidates, select routes, score cities, call DeepSeek, or persist participant identity. Require argument-array CLI execution with shell disabled. Require gateway lint, test, and build. Ignore generated dist, coverage, probe output, and caches.

- [ ] **Step 4: Implement the redacted probe**

~~~js
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
const execFile = promisify(execFileCallback);

export function summarizeProbeResult(provider, latencyMs, rows) {
  return {
    provider, status: "ok", latencyMs, resultCount: rows.length,
    fieldNames: [...new Set(rows.flatMap((row) => Object.keys(row)))].sort(),
  };
}

export async function probeFlyAI({ exec = execFile } = {}) {
  const startedAt = Date.now();
  const executable = process.env.FLYAI_PROBE_CLI_PATH || "flyai";
  const { stdout } = await exec(executable, [
    "search-train", "--origin", "北京", "--destination", "上海",
    "--dep-date", "2026-08-01", "--journey-type", "1", "--sort-type", "3",
  ], { shell: false, timeout: 12_000, maxBuffer: 1_000_000 });
  const parsed = JSON.parse(stdout.trim());
  return summarizeProbeResult(
    "flyai", Date.now() - startedAt,
    Array.isArray(parsed) ? parsed : parsed.results ?? [],
  );
}
~~~

Implement Amap using AbortSignal.timeout(3000). When executed directly, print one JSON line. Convert failures to stable codes without exception messages.

- [ ] **Step 5: Register configuration**

Add TRAVEL_GATEWAY_URL, TRAVEL_GATEWAY_TOKEN, TRAVEL_GATEWAY_TIMEOUT_MS=30000, TRAVEL_CALCULATION_TIMEOUT_MS=45000, and FLYAI_PROBE_CLI_PATH to **.env.example**. Add the package script:

~~~json
"probe:providers": "node scripts/probe-travel-providers.mjs"
~~~

- [ ] **Step 6: Verify GREEN and safe missing-credential behavior**

Run: npm run test -- tests/provider-probe.test.ts

Expected: PASS.

Run: env -u AMAP_API_KEY -u FLYAI_API_KEY npm run probe:providers

Expected: one JSON line with missing-credential statuses and no environment values.

- [ ] **Step 7: Commit**

~~~bash
git add AGENTS.md .env.example package.json scripts/probe-travel-providers.mjs tests/provider-probe.test.ts
git commit -m "chore: add provider capability gate"
~~~

Public-beta enablement remains blocked until a human confirms authorization, quota, fields, and booking-link behavior. Fixture-based development may continue.

---

### Task 2: Implement Local-First Amap Search

**Files:**
- Create: **src/lib/city/amap-client.ts**
- Modify: **src/lib/city/city-provider.ts**
- Modify: **tests/provider-shells.test.ts**

**Interfaces:**
- Produces: searchAmapCities(query, options) returning narrow AmapCityCandidate values; preserves searchCities(query): Promise<City[]>.

- [ ] **Step 1: Add failing tests**

Test that local hits make zero requests; a remote tip named 武汉市 maps to local wuhan; remote prefecture-level city tips return stable `amap-<adcode>` selectable cities; non-city places return no selectable city; HTTP failure, status 0, invalid JSON, and abort return an empty list.

~~~ts
vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
  status: "1",
  tips: [{ name: "武汉市", district: "湖北省", adcode: "420100" }],
}), { status: 200 })));
vi.stubEnv("AMAP_API_KEY", "test-key");
await expect(searchCities("武汉市")).resolves.toEqual([
  expect.objectContaining({ code: "wuhan", name: "武汉" }),
]);
~~~

- [ ] **Step 2: Verify RED**

Run: npm run test -- tests/provider-shells.test.ts

Expected: remote-mapping test fails because the shell returns an empty list.

- [ ] **Step 3: Implement strict Amap parsing**

~~~ts
const amapResponseSchema = z.object({
  status: z.literal("1"),
  tips: z.array(z.object({
    name: z.string().min(1),
    district: z.string().optional().default(""),
    adcode: z.string().regex(/^\d{6}$/).optional(),
  })).default([]),
});
~~~

Call https://restapi.amap.com/v3/assistant/inputtips with keywords and the server key, using a passed signal or AbortSignal.timeout(3000). Never log the key or body.

- [ ] **Step 4: Map only to the local library**

Return local matches immediately. After a local miss, remove a final 市 from Amap names, exact-match supported Chinese city names in CITIES when possible, otherwise accept prefecture-level or municipality adcodes as `amap-<adcode>` city results, deduplicate by code, and return at most eight.

- [ ] **Step 5: Verify GREEN**

Run: npm run test -- tests/provider-shells.test.ts tests/city-search-route.test.ts

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add src/lib/city/amap-client.ts src/lib/city/city-provider.ts tests/provider-shells.test.ts
git commit -m "feat: add Amap city validation"
~~~

---

### Task 3: Add Query Freshness To The Shared Contract

**Files:**
- Modify: **src/types/domain.ts**
- Modify: **src/lib/travel/types.ts**
- Modify: **src/lib/travel/estimate-provider.ts**
- Create: **src/lib/travel/unavailable-option.ts**
- Modify: **src/lib/recommendation/calculate-run.ts**
- Modify: **supabase/schema.sql**
- Create: **supabase/migrations/202607120001_add_travel_option_queried_at.sql**
- Modify: **tests/scoring.test.ts**
- Modify: **tests/calculate-run.test.ts**
- Modify: **tests/fallback-mvp-flow.test.ts**
- Modify: **tests/provider-shells.test.ts**

**Interfaces:**
- Produces: TravelOption.queriedAt, GatewaySearchRequest, GatewayTravelOption, GatewaySearchResponse.

- [ ] **Step 1: Add failing assertions**

Assert estimates contain queriedAt: null and database inserts contain queried_at for a real fixture.

- [ ] **Step 2: Verify RED**

Run: npm run test -- tests/provider-shells.test.ts tests/calculate-run.test.ts

Expected: FAIL for missing fields.

- [ ] **Step 3: Add types and estimate value**

~~~ts
export type GatewaySearchRequest = {
  originCityCode: string;
  originCityName: string;
  destinationCityCode: string;
  destinationCityName: string;
  meetingDate: string;
  mode: TransportMode;
};

export type GatewayTravelOption = Omit<TravelOption,
  "participantId" | "candidateCityCode" | "waitMinutes" | "failureReason"
>;

export type GatewaySearchResponse = {
  options: GatewayTravelOption[];
  queriedAt: string;
  cache: "hit" | "miss";
};
~~~

Add queriedAt: string | null to TravelOption and queriedAt: null to all estimates and fixtures. Add createUnavailableTravelOption(input, mode, reason) returning source unavailable, null price, times, duration, and query time, provider flyai, no booking URL, and stable failure reason NO_FEASIBLE_SAME_DAY_ROUTE.

- [ ] **Step 4: Add persistence**

Add nullable queried_at timestamptz to **supabase/schema.sql** and create:

~~~sql
alter table travel_options
  add column if not exists queried_at timestamptz;
~~~

Add queried_at: option.queriedAt to the insert mapper.

- [ ] **Step 5: Verify GREEN**

Run: npm run test -- tests/scoring.test.ts tests/provider-shells.test.ts tests/calculate-run.test.ts tests/fallback-mvp-flow.test.ts

Run: npm run build

Expected: all pass.

- [ ] **Step 6: Commit**

~~~bash
git add src/types/domain.ts src/lib/travel src/lib/recommendation/calculate-run.ts supabase tests
git commit -m "feat: track travel query freshness"
~~~

---

### Task 4: Scaffold The Gateway And Define Its Contract

**Files:**
- Create: **services/travel-provider-gateway/package.json**
- Create: **services/travel-provider-gateway/package-lock.json**
- Create: **services/travel-provider-gateway/tsconfig.json**
- Create: **services/travel-provider-gateway/eslint.config.mjs**
- Create: **services/travel-provider-gateway/.env.example**
- Create: **services/travel-provider-gateway/src/contracts.ts**
- Create: **services/travel-provider-gateway/tests/contracts.test.ts**

**Interfaces:**
- Produces strict gatewaySearchRequestSchema, gatewayTravelOptionSchema, gatewaySearchResponseSchema, GatewayErrorCode, and GatewayErrorBody.

- [ ] **Step 1: Create the isolated package**

Use scripts dev=tsx src/server.ts, build=tsc -p tsconfig.json, start=node dist/server.js, lint=eslint ., test=vitest run. Install zod and @fly-ai/flyai-cli; install TypeScript, tsx, Vitest, ESLint, typescript-eslint, and Node types as dev dependencies. Commit the generated lockfile so the CLI is pinned.

Create a gateway-only environment example containing FLYAI_API_KEY, TRAVEL_GATEWAY_TOKEN, PORT=8080, FLYAI_TIMEOUT_MS=12000, FLYAI_RETRY_COUNT=1, FLYAI_CONCURRENCY=4, and TRAVEL_CACHE_TTL_MS=300000. Remove FLYAI_API_KEY and the obsolete production FLYAI_CLI_PATH from the root application's environment example; retain only FLYAI_PROBE_CLI_PATH there for the operator-run probe.

- [ ] **Step 2: Write failing contract tests**

Cover valid input, unknown keys, unsupported modes, invalid dates, oversized names, negative prices, invalid timestamps, and unsafe booking URLs.

- [ ] **Step 3: Verify RED**

Run inside the gateway: npm run test -- tests/contracts.test.ts

Expected: FAIL because contracts.ts is absent.

- [ ] **Step 4: Implement strict schemas**

~~~ts
export const gatewaySearchRequestSchema = z.object({
  originCityCode: z.string().regex(/^[a-z0-9-]{1,24}$/),
  originCityName: z.string().trim().min(1).max(24),
  destinationCityCode: z.string().regex(/^[a-z0-9-]{1,24}$/),
  destinationCityName: z.string().trim().min(1).max(24),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["flight", "high_speed_rail", "normal_train"]),
}).strict();

export const gatewayErrorCodeSchema = z.enum([
  "UNAUTHORIZED", "INVALID_REQUEST", "PROVIDER_TIMEOUT",
  "PROVIDER_UNAVAILABLE", "PROVIDER_INVALID_RESPONSE", "INTERNAL_ERROR",
]);
~~~

Require real source, flyai provider, nonnegative integer price, offset ISO times, positive duration, service identity, and approved HTTPS booking URL or null.

- [ ] **Step 5: Verify GREEN**

Run inside the gateway: npm run test -- tests/contracts.test.ts

Run: npm run lint and npm run build

Expected: all pass.

- [ ] **Step 6: Commit**

~~~bash
git add services/travel-provider-gateway
git commit -m "feat: define travel gateway contract"
~~~

---

### Task 5: Normalize FlyAI Through Safe CLI Execution

**Files:**
- Create: **services/travel-provider-gateway/src/flyai-adapter.ts**
- Create: **services/travel-provider-gateway/tests/flyai-adapter.test.ts**

**Interfaces:**
- Produces searchFlyAI(input, dependencies): Promise<GatewayTravelOption[]> and typed FlyAIAdapterError.

- [ ] **Step 1: Write failing tests**

Assert search-flight and search-train arguments, shell false, 12-second timeout, bounded buffer, G/C/D high-speed classification, normal-train exclusion, normalized fields, invalid-row rejection, typed timeout, and no raw stdout logging.

- [ ] **Step 2: Verify RED**

Run inside the gateway: npm run test -- tests/flyai-adapter.test.ts

Expected: FAIL because the adapter is absent.

- [ ] **Step 3: Implement argument construction**

~~~ts
function buildArgs(input: GatewaySearchRequest): string[] {
  const command = input.mode === "flight" ? "search-flight" : "search-train";
  return [
    command, "--origin", input.originCityName,
    "--destination", input.destinationCityName,
    "--dep-date", input.meetingDate, "--sort-type", "3",
  ];
}
~~~

Resolve only the configured or package-local executable. Use execFile with shell false, timeout 12000, and maxBuffer 1000000. HTTP input cannot set executables or flags.

- [ ] **Step 4: Implement strict normalization**

Base the narrow raw schema on redacted probe field names. Keep aliases inside this adapter. Reject rows without price, times, duration, service identity, or valid category. Classify train numbers beginning G, C, or D as high_speed_rail; other valid services as normal_train.

- [ ] **Step 5: Verify GREEN**

Run inside the gateway: npm run test -- tests/flyai-adapter.test.ts

Run: npm run lint and npm run build

Expected: all pass.

- [ ] **Step 6: Commit**

~~~bash
git add services/travel-provider-gateway/src/flyai-adapter.ts services/travel-provider-gateway/tests/flyai-adapter.test.ts
git commit -m "feat: normalize FlyAI travel results"
~~~

---

### Task 6: Add Gateway Resilience And HTTP Authentication

**Files:**
- Create: **services/travel-provider-gateway/src/cache.ts**
- Create: **services/travel-provider-gateway/src/limiter.ts**
- Create: **services/travel-provider-gateway/src/service.ts**
- Create: **services/travel-provider-gateway/src/server.ts**
- Create: tests for cache, limiter, service, and server.

**Interfaces:**
- Produces createTravelSearchService, createGatewayServer, GET /healthz, and authenticated POST /v1/search.

- [ ] **Step 1: Write failing cache and limiter tests**

Use fake time to prove 300000 ms TTL, 1000-entry oldest eviction, FIFO execution, and no more than four active provider calls.

- [ ] **Step 2: Write failing service and server tests**

Cover cache hit/miss, one retry for timeout/unavailable only, no retry for invalid response, stable error mapping, missing/wrong bearer token, body over 16 KiB, invalid JSON, valid response, and secret-free health response.

- [ ] **Step 3: Verify RED**

Run inside the gateway: npm run test

Expected: FAIL because runtime units are absent.

- [ ] **Step 4: Implement focused cache and limiter units**

~~~ts
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly ttlMs = 300_000,
    private readonly maxEntries = 1_000,
  ) {}

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }
}
~~~

Cache key: origin code, destination code, date, mode, filter version v1. Never include participant identity.

- [ ] **Step 5: Implement service orchestration**

Validate, check cache, run through the limiter, retry once for timeout/unavailable, add one queriedAt timestamp, strictly validate, and cache the response.

- [ ] **Step 6: Implement the Node HTTP server**

Use node:http. Require Authorization Bearer TRAVEL_GATEWAY_TOKEN for /v1/search and timing-safe comparison. Cap body size, parse once, return JSON, and never echo exception messages. Map stable errors to 400, 401, 502, 503, and 504.

- [ ] **Step 7: Verify GREEN**

Run inside the gateway: npm run lint, npm run test, npm run build

Expected: all pass.

- [ ] **Step 8: Commit**

~~~bash
git add services/travel-provider-gateway/src services/travel-provider-gateway/tests
git commit -m "feat: add resilient travel gateway"
~~~

---

### Task 7: Containerize The Gateway

**Files:**
- Create: **services/travel-provider-gateway/Dockerfile**
- Create: **services/travel-provider-gateway/.dockerignore**
- Create: **services/travel-provider-gateway/tests/container-config.test.ts**
- Modify: **.gitignore**

**Interfaces:**
- Produces a non-root container listening on PORT and receiving secrets only at runtime.

- [ ] **Step 1: Write a failing Dockerfile policy test**

Assert npm ci, TypeScript build, node dist/server.js, non-root user, and absence of literal secret names or values in build arguments.

- [ ] **Step 2: Verify RED**

Run inside the gateway: npm run test -- tests/container-config.test.ts

Expected: FAIL because Dockerfile is absent.

- [ ] **Step 3: Add a multi-stage Node 20 slim build**

Install from the lockfile, build TypeScript, prune dev dependencies, use the node user, expose 8080, and start dist/server.js. Do not use ARG or baked ENV for secrets.

- [ ] **Step 4: Add cleanup rules**

Ignore node_modules, dist, coverage, .env files, caches, and probe output.

- [ ] **Step 5: Verify**

Run inside the gateway: npm run test -- tests/container-config.test.ts and npm run build.

If Docker exists, run docker build -t cross-city-travel-gateway:test .

Expected: tests/build pass; Docker smoke verifies image build plus container `GET /healthz`, unauthenticated `POST /v1/search` rejection, and authenticated `POST /v1/search` routing.

- [ ] **Step 6: Commit**

~~~bash
git add .gitignore services/travel-provider-gateway
git commit -m "build: containerize travel gateway"
~~~

---

### Task 8: Connect The Main Application With Per-Mode Fallback

**Files:**
- Create: **src/lib/travel/gateway-client.ts**
- Modify: **src/lib/travel/flyai-provider.ts**
- Modify: **tests/provider-shells.test.ts**

**Interfaces:**
- Produces searchGateway(input, options) and FlyAITravelProvider.search returning real options, unavailable options for successful empty searches, and estimates for failed requests.

- [ ] **Step 1: Write failing tests**

Cover authenticated POST, timeout, non-OK status, invalid schema, real mapping to participant/candidate, successful empty response producing an unavailable option, total request failure producing an estimate, and missing gateway URL. Authorization must never appear in thrown messages.

- [ ] **Step 2: Verify RED**

Run: npm run test -- tests/provider-shells.test.ts

Expected: FAIL because the provider always estimates.

- [ ] **Step 3: Implement the client**

Use fetch with AbortSignal.timeout(Number(TRAVEL_GATEWAY_TIMEOUT_MS or 30000)), one mode per request, strict Zod response parsing, and stable internal errors GATEWAY_NOT_CONFIGURED, GATEWAY_TIMEOUT, GATEWAY_UNAVAILABLE, GATEWAY_INVALID_RESPONSE.

- [ ] **Step 4: Replace the shell**

Call the gateway per accepted mode. Map route facts to participant and candidate. Filter unexpected modes. A successful response with no valid result emits exactly one unavailable option for that mode. A timeout, transport error, provider error, or missing gateway configuration emits exactly one estimate for that mode. One mode failure must not reject the provider search.

- [ ] **Step 5: Verify GREEN**

Run: npm run test -- tests/provider-shells.test.ts tests/calculate-run.test.ts

Run: npm run lint and npm run build

Expected: all pass.

- [ ] **Step 6: Commit**

~~~bash
git add src/lib/travel/gateway-client.ts src/lib/travel/flyai-provider.ts tests/provider-shells.test.ts
git commit -m "feat: connect app to travel gateway"
~~~

---

### Task 9: Deduplicate Searches And Enforce Feasibility

**Files:**
- Create: **src/lib/recommendation/travel-search.ts**
- Create: **tests/travel-search.test.ts**
- Modify: **src/lib/recommendation/calculate-run.ts**
- Modify: **src/lib/recommendation/scoring.ts**
- Modify: **src/lib/fallback/mvp-store.ts**
- Modify: calculation and fallback tests.

**Interfaces:**
- Produces collectTravelOptions({ participants, candidates, meetingDate, targetArrivalTime, provider, timeoutMs }) returning options and usedFallback.

- [ ] **Step 1: Write failing orchestration tests**

Prove same origin/destination/date/mode makes one provider call; facts clone per participant; wrong-day departure and late arrival are rejected; Asia/Shanghai time is used; total timeout estimates unfinished groups; shuffled provider ordering gives identical selected routes and rankings.

- [ ] **Step 2: Verify RED**

Run: npm run test -- tests/travel-search.test.ts tests/calculate-run.test.ts

Expected: FAIL because current nested loops duplicate calls and do not enforce feasibility.

- [ ] **Step 3: Implement stable query keys and filters**

~~~ts
export function travelSearchKey(input: {
  originCityCode: string;
  destinationCityCode: string;
  meetingDate: string;
  mode: TransportMode;
}) {
  return [
    input.originCityCode, input.destinationCityCode,
    input.meetingDate, input.mode, "v1",
  ].join(":");
}
~~~

Use Intl.DateTimeFormat with timeZone Asia/Shanghai; require meeting-date equality and arrival HH:mm no later than targetArrivalTime. Do not compare timestamp strings lexically.

- [ ] **Step 4: Implement deduplicated collection**

Group participants by query key, call once, clone facts, deterministically sort, and enforce TRAVEL_CALCULATION_TIMEOUT_MS default 45000. Estimate unfinished groups.

- [ ] **Step 5: Replace both nested loops**

Use collectTravelOptions in the Supabase and in-memory paths. Keep generateCandidateCities unchanged. Store only PARTIAL_ESTIMATE_FALLBACK in error_summary when applicable.

- [ ] **Step 6: Exclude infeasible candidates from primary labels**

Update pickPrimaryRecommendations to filter candidates with missingPenalty greater than zero before applying cheapest, balanced, and fastest labels. The existing scoring function already derives missingPenalty when a participant lacks a selectable route. Add scoring tests proving an infeasible low-price candidate cannot receive a primary label and an all-infeasible set returns no primary recommendations.

- [ ] **Step 7: Verify GREEN**

Run: npm run test -- tests/travel-search.test.ts tests/calculate-run.test.ts tests/fallback-mvp-flow.test.ts tests/scoring.test.ts

Run: npm run build

Expected: all pass.

- [ ] **Step 8: Commit**

~~~bash
git add src/lib/recommendation src/lib/fallback/mvp-store.ts tests
git commit -m "feat: orchestrate deterministic travel searches"
~~~

---

### Task 10: Show Source, Freshness, And Safe Booking Actions

**Files:**
- Modify: **src/app/p/[code]/result/page.tsx**
- Modify: **src/lib/fallback/mvp-store.ts**
- Modify: **src/components/result/RecommendationCard.tsx**
- Create: **src/lib/travel/booking-url.ts**
- Create: **tests/recommendation-card.test.tsx**
- Modify: **tests/plan-read-route.test.ts**

**Interfaces:**
- Consumes provider, source, queried_at, and booking_url.
- Produces approved Chinese reference-price, mixed-data, and no-feasible-city UX.

- [ ] **Step 1: Install focused UI test dependencies if absent**

Install @testing-library/react, @testing-library/jest-dom, and jsdom as dev dependencies. Use a per-file jsdom directive rather than changing all tests.

- [ ] **Step 2: Write failing UI tests**

Assert real FlyAI rows show 飞猪参考价, query time, train or flight number, station names when available, time range, duration, and fare; result cards render no provider booking links or 去飞猪查看 action; estimates show 估算; mixed cards show 部分数据为估算; team total fare remains visible and average fare remains absent.

- [ ] **Step 3: Verify RED**

Run: npm run test -- tests/recommendation-card.test.tsx

Expected: FAIL because provider and freshness are not rendered.

- [ ] **Step 4: Read and map source fields**

Extend Supabase selection and fallback mapping with provider and queried_at. Extend ParticipantOption accordingly.

- [ ] **Step 5: Implement source and booking UI**

Render 飞猪参考价 for real FlyAI rows and 估算 otherwise. Format query time in China time. Accept only HTTPS and allowlisted Fliggy hosts in booking-url.ts. Add target blank and noreferrer noopener.

- [ ] **Step 6: Implement no-feasible-city behavior**

When the latest run contains no recommendation with a primary label, render 按当前到达时间，没有找到全员可行城市 and 请调整目标到达时间或会议日期后重新计算 instead of presenting an unlabeled candidate as a recommendation.

- [ ] **Step 7: Verify GREEN**

Run: npm run test -- tests/recommendation-card.test.tsx tests/plan-read-route.test.ts tests/fallback-mvp-flow.test.ts

Run: npm run lint and npm run build

Expected: all pass.

- [ ] **Step 8: Commit**

~~~bash
git add package.json package-lock.json src/app/p/[code]/result/page.tsx src/lib/fallback/mvp-store.ts src/components/result/RecommendationCard.tsx src/lib/travel/booking-url.ts tests
git commit -m "feat: show travel source and freshness"
~~~

---

### Task 11: Reconcile Stable Documentation

**Files:**
- Modify: **README.md**
- Modify: **docs/architecture.md**
- Modify: **docs/integration-guide.md**

**Interfaces:**
- Produces operator setup, deployment, error codes, migration, acceptance gates, and smoke-test instructions.

- [ ] **Step 1: Update the architecture**

Document Browser to Next.js to Amap; Next.js to Travel Gateway to FlyAI; deterministic selection/scoring before DeepSeek explanation.

- [ ] **Step 2: Document exact environments and startup**

Gateway:

~~~bash
cd services/travel-provider-gateway
npm ci
npm run dev
~~~

Main app:

~~~bash
npm run dev
~~~

Before these commands, copy the relevant example environment file, insert operator-owned secrets locally, and never commit it. Document migration, health route, search route, stable error codes, limits, fallback messages, and authorization gate.

- [ ] **Step 3: Check for stale knowledge**

Run:

~~~bash
rg -n "FLYAI_CLI_PATH|接入实时票务后|DeepSeek.*排名|average fare" README.md docs .env.example AGENTS.md
~~~

Expected: no stale production direct-CLI instruction, future-tense estimate copy, DeepSeek ranking permission, or average-fare UI recommendation.

- [ ] **Step 4: Commit**

~~~bash
git add README.md docs/architecture.md docs/integration-guide.md
git commit -m "docs: document travel provider operations"
~~~

---

### Task 12: Full Verification And Redacted Real Smoke

**Files:**
- Modify only files already in scope if verification reveals defects.

**Interfaces:**
- Produces verified root app, verified gateway, and an evidence-based external readiness report.

- [ ] **Step 1: Verify the gateway**

Run inside the gateway: npm run lint, npm run test, npm run build

Expected: all exit 0.

- [ ] **Step 2: Verify the root app**

Run: npm run lint, npm run test, npm run build

Expected: all exit 0; report test count.

- [ ] **Step 3: Run credential-free smoke**

Create a plan, add participants, calculate, and verify local search and estimates remain usable, every route is labeled estimated, and no booking action appears.

- [ ] **Step 4: Run the credentialed redacted probe**

Run: npm run probe:providers

Expected: one JSON summary with statuses, counts, latency, and field names only. If credentials are unavailable, report the external gate as unverified.

- [ ] **Step 5: Run real gateway smoke**

Verify real flight/train source, identity, price, timestamps, queriedAt, meeting-day filtering, mixed fallback, deterministic ranking, validated booking actions, and unchanged DeepSeek boundary. Inspect logs for absence of tokens, names, raw payloads, and full booking URLs.

- [ ] **Step 6: Inspect repository state**

Run: git diff --check, git status --short, git log -12 --oneline

Expected: no whitespace errors and only intentional verification fixes uncommitted.

- [ ] **Step 7: Commit verification fixes only if needed**

If verification changed a file, return to that file's owning task, rerun its focused tests plus both full suites, stage exactly the paths named in that task's commit step, and use commit message fix: resolve travel integration verification. Do not create an empty commit and do not push.

---

## Execution And Review Gates

1. Task 1 precedes any gateway directory.
2. Tasks 2 and 3 are independently reviewable.
3. Tasks 4-7 build the isolated gateway.
4. Tasks 8-10 connect it to the product.
5. Task 11 runs after behavior is stable.
6. Task 12 is the completion gate.
7. Amap may ship after Task 2 plus full root verification.
8. FlyAI public-beta enablement remains blocked until human authorization and Tasks 4-12 pass.
