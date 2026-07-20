# Publication Safety And Run Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Batch A's FlyAI publication, anonymous-read, run-creation, route-recovery, and stale-run gaps without weakening verified-evidence or private-preview boundaries.

**Architecture:** Keep supplier fact normalization inside the isolated gateway, make the HTTP API the only public projection, and move concurrent run-creation decisions into the existing transactional Supabase RPC. Mirror the durable creation and expiry contract in fallback mode, then let the orchestrator terminalize only exhausted route tasks while other bounded work continues.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zod 4, Vitest 4, Supabase/PostgreSQL PL/pgSQL, Node 20 gateway.

---

## Authority And Constraints

- Approved design: `docs/superpowers/specs/2026-07-20-publication-safety-and-run-recovery-design.md`.
- Preserve the current recommendation policy `2026-07-19.v2`, participant-owned quote lookup, one-city/two-scheme result contract, and host-only confirmation.
- Do not query, apply, or claim remote migration state.
- Do not run live FlyAI or real supplier acceptance.
- Do not edit the historical initial migration `supabase/migrations/202607080001_initial_schema.sql`; add a new hardening migration.
- Preserve the user's existing `.superpowers/sdd/progress.md` work. Append only the Batch A completion record after implementation and inspect the diff before staging it.
- Use failing-first tests for every behavior change.
- After code changes, run root and gateway lint, test, and build gates.

## File And Responsibility Map

### Create

- `supabase/migrations/202607210001_publication_safety_and_run_recovery.sql` — deployed-state RLS hardening, Realtime removal, run-creation replacement, and recovery/stale database helpers.
- `tests/supabase-public-read-boundary.test.ts` — static regression for API-only public projection and anonymous table denial.
- `src/lib/recommendation/run-deadlines.ts` — shared 15-minute/7-day deadline constants and status-to-deadline helper.
- `tests/run-deadlines.test.ts` — deterministic deadline contract.

### Gateway

- `AGENTS.md` — permanent full-itinerary evidence rule, updated before gateway practice.
- `services/travel-provider-gateway/src/flyai-adapter.ts` — bounded full-itinerary normalization and segment-aware evidence identity.
- `services/travel-provider-gateway/tests/flyai-adapter.test.ts` — connecting, mixed-mode, sequence, and evidence-ID regressions.

### Durable state machine

- `AGENTS.md` — permanent API-only public projection and anonymous-table-denial rule, updated before implementation practice.
- `supabase/schema.sql` — canonical fresh-install schema matching the new migration's final state.
- `src/lib/recommendation/repository.ts` — strict run-creation union, `staleAfter`, exhausted-task RPC, and stale-run CAS methods.
- `src/lib/agent/manager-agent.ts` — return the repository's created/resumed run contract unchanged.
- `src/lib/agent/run-orchestrator.ts` — stale-run terminalization and per-task recovery exhaustion.
- `src/lib/recommendation/alternative-preview.ts` — structured alternative create/resume results.
- `src/lib/security/host-confirmation.ts` — reject expired private previews before publication and preserve completed idempotency.

### HTTP and fallback parity

- `src/lib/fallback/mvp-store.ts` — deterministic clock, stale deadlines, created/resumed/rejected semantics, and preview expiry.
- `src/lib/recommendation/calculate-run.ts` — forward the unified creation result.
- `src/app/api/plans/[code]/calculate/route.ts` — `202 created`, `200 resume_existing`, and safe 409 mappings.
- `src/app/api/plans/[code]/previews/route.ts` — the same disposition/status contract for private preview creation.
- `src/app/api/plans/[code]/previews/[runId]/confirm/route.ts` — map `PREVIEW_EXPIRED` to HTTP 409.
- `src/components/result/AlternativeCityFlow.tsx` — consume the returned status instead of fabricating `pending`.
- `src/lib/ui/api-error-message.ts` — actionable Chinese copy for new safe error codes.

### Tests and documentation

- `tests/multi-agent-schema.test.ts`
- `tests/recommendation-run-schema.test.ts`
- `tests/recommendation-repository.test.ts`
- `tests/manager-agent.test.ts`
- `tests/run-orchestrator.test.ts`
- `tests/calculate-route.test.ts`
- `tests/alternative-preview-route.test.ts`
- `tests/fallback-calculation-lock.test.ts`
- `tests/fallback-publication-guard.test.ts`
- `tests/host-confirmation.test.ts`
- `tests/host-confirmation-route.test.ts`
- `tests/plan-read-route.test.ts`
- `tests/api-error-message.test.ts`
- `docs/architecture.md`
- `docs/integration-guide.md`
- `.superpowers/sdd/progress.md`

---

### Task 1: Normalize Complete FlyAI Itineraries

**Files:**
- Modify: `AGENTS.md`
- Modify: `services/travel-provider-gateway/tests/flyai-adapter.test.ts`
- Modify: `services/travel-provider-gateway/src/flyai-adapter.ts`

- [ ] **Step 1: Write failing connecting-itinerary tests**

Add a reusable connecting fixture and tests that assert full-journey facts:

```ts
const liveConnectingFlightItem = {
  ...liveFlightItem,
  totalDuration: "05:00:00",
  journeys: [{ segments: [
    liveFlightItem.journeys[0].segments[0],
    {
      depDateTime: "2026-08-20 11:00:00",
      arrDateTime: "2026-08-20 13:00:00",
      duration: "02:00:00",
      marketingTransportNo: "MU5202",
      transportType: "flight",
      depStationName: "武汉天河",
      arrStationName: "上海浦东",
    },
  ] }],
};

async function searchLiveItem(
  item: unknown,
  input: GatewaySearchRequest = baseInput,
) {
  return searchFlyAI(input, {
    execFile: executorReturning({ data: { itemList: [item] } }),
    executable: "/safe/flyai",
  });
}

it("normalizes every segment of a connecting itinerary", async () => {
  const result = await searchLiveItem(liveConnectingFlightItem);

  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    departAt: "2026-08-20T08:00:00+08:00",
    arriveAt: "2026-08-20T13:00:00+08:00",
    durationMinutes: 300,
    isDirect: false,
    hasTransfer: true,
    transferCount: 1,
    serviceName: "MU5101 → MU5202",
    departureStationName: "北京首都",
    arrivalStationName: "上海浦东",
  });
});

it("flattens multiple journey groups in supplier order", async () => {
  const [first, second] = liveConnectingFlightItem.journeys[0].segments;
  const result = await searchLiveItem({
    ...liveConnectingFlightItem,
    journeys: [{ segments: [first] }, { segments: [second] }],
  });
  expect(result[0]).toMatchObject({
    serviceName: "MU5101 → MU5202",
    transferCount: 1,
    arriveAt: "2026-08-20T13:00:00+08:00",
  });
});

it("rejects overlapping connecting segments", async () => {
  const [first, second] = liveConnectingFlightItem.journeys[0].segments;
  await expect(searchLiveItem({
    ...liveConnectingFlightItem,
    journeys: [{ segments: [first, { ...second, depDateTime: "2026-08-20 10:00:00" }] }],
  })).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
});

it("rejects more than eight total segments", async () => {
  await expect(searchLiveItem({
    ...liveFlightItem,
    journeys: [{ segments: Array.from(
      { length: 9 },
      () => liveFlightItem.journeys[0].segments[0],
    ) }],
  })).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
});

it("rejects a high-speed itinerary containing a normal-train segment", async () => {
  const railItem = {
    price: "400",
    totalDuration: "05:00:00",
    journeys: [{ segments: [
      { ...liveConnectingFlightItem.journeys[0].segments[0], marketingTransportNo: "G1", transportType: "train" },
      { ...liveConnectingFlightItem.journeys[0].segments[1], marketingTransportNo: "K123", transportType: "train" },
    ] }],
  };
  await expect(searchLiveItem(railItem, { ...baseInput, mode: "high_speed_rail" }))
    .rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
});

it("changes evidence ID when an internal segment changes", async () => {
  const baseline = await searchLiveItem(liveConnectingFlightItem);
  const [first, second] = liveConnectingFlightItem.journeys[0].segments;
  const changed = await searchLiveItem({
    ...liveConnectingFlightItem,
    journeys: [{ segments: [first, { ...second, depStationName: "武汉天河 T2" }] }],
  });
  expect(changed[0]?.quoteId).not.toBe(baseline[0]?.quoteId);
});
```

For rejected single-item payloads, assert `PROVIDER_INVALID_RESPONSE`. For mixed-mode and sequence failures, assert diagnostics contain only the new safe dropped category and do not contain station, time, service, or price facts.

- [ ] **Step 2: Run the gateway test and verify failure**

Run:

```bash
npm run test -- tests/flyai-adapter.test.ts
```

Working directory: `services/travel-provider-gateway/`

Expected: FAIL because the adapter still reads only `journeys[0].segments[0]`, reports the first arrival, and does not reject mixed or invalid segment sequences.

- [ ] **Step 3: Implement bounded segment normalization**

Update the project rule before changing gateway practice. Add beside the existing FlyAI normalization constraints in `AGENTS.md`:

```markdown
- FlyAI connecting itineraries must normalize the complete ordered segment set: first departure, final arrival, full elapsed duration, all service identities, and `segmentCount - 1` transfers. Reject overlapping, out-of-order, over-eight-segment, or mixed requested-mode evidence instead of publishing a first-segment summary.
```

Add an internal normalized-segment type and helpers. Keep raw payload fields inside the adapter:

```ts
type NormalizedLiveSegment = {
  departAt: string;
  arriveAt: string;
  serviceName: string;
  departureStationName: string | null;
  arrivalStationName: string | null;
  mode: GatewaySearchRequest["mode"] | null;
};

function classifyLiveSegment(
  segment: z.infer<typeof liveSegmentSchema>,
  requestedMode: GatewaySearchRequest["mode"],
): GatewaySearchRequest["mode"] | null {
  if (requestedMode === "flight") {
    return /flight|航班/i.test(segment.transportType) ? "flight" : null;
  }
  const railMode = /^[GCD]/i.test(segment.marketingTransportNo)
    ? "high_speed_rail"
    : "normal_train";
  return /train|rail|火车|铁路/i.test(segment.transportType) ? railMode : null;
}
```

In `normalizeLiveItem`, flatten and validate the complete list:

```ts
const segments = item.journeys.flatMap((journey) => journey.segments);
if (segments.length === 0 || segments.length > 8) return null;

const normalizedSegments = segments.map((segment) => ({
  departAt: withChinaOffset(segment.depDateTime),
  arriveAt: withChinaOffset(segment.arrDateTime),
  serviceName: segment.marketingTransportNo,
  departureStationName: firstStringValue(segment, DEPARTURE_STATION_KEYS),
  arrivalStationName: firstStringValue(segment, ARRIVAL_STATION_KEYS),
  mode: classifyLiveSegment(segment, mode),
}));

if (normalizedSegments.some((segment) => segment.mode !== mode)) return null;
for (const [index, segment] of normalizedSegments.entries()) {
  const depart = Date.parse(segment.departAt);
  const arrive = Date.parse(segment.arriveAt);
  const previous = normalizedSegments[index - 1];
  if (!Number.isFinite(depart) || !Number.isFinite(arrive) || arrive <= depart) return null;
  if (previous && depart < Date.parse(previous.arriveAt)) return null;
}

const first = normalizedSegments[0]!;
const last = normalizedSegments.at(-1)!;
const durationMinutes = (Date.parse(last.arriveAt) - Date.parse(first.departAt)) / 60_000;
if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return null;
```

Return first/last endpoints, joined service identity, and full transfer count. Add a bounded canonical segment signature to `rawRowSchema` and `EvidenceFields`:

```ts
segmentSignature: normalizedSegments.map((segment) => [
  segment.serviceName,
  segment.departAt,
  segment.arriveAt,
  segment.departureStationName,
  segment.arrivalStationName,
]),
```

Include that signature in `evidenceId`. Keep legacy fixture rows backward-compatible by using `null` when no segment signature exists. Return a discriminated internal failure reason so the live-item loop records `mixed_transport_category`, `invalid_segment_sequence`, or `missing_required_route_fact` without logging facts.

- [ ] **Step 4: Run focused gateway tests**

Run:

```bash
npm run test -- tests/flyai-adapter.test.ts
```

Expected: PASS, including all existing direct, redaction, price, mode, and booking URL cases.

- [ ] **Step 5: Commit the gateway fix**

```bash
git add AGENTS.md services/travel-provider-gateway/src/flyai-adapter.ts services/travel-provider-gateway/tests/flyai-adapter.test.ts
git commit -m "fix: normalize complete FlyAI itineraries"
```

---

### Task 2: Remove Anonymous Database Enumeration

**Files:**
- Create: `tests/supabase-public-read-boundary.test.ts`
- Create: `supabase/migrations/202607210001_publication_safety_and_run_recovery.sql`
- Modify: `AGENTS.md`
- Modify: `supabase/schema.sql`
- Modify: `tests/multi-agent-schema.test.ts`

- [ ] **Step 1: Write failing API-only projection tests**

Create `tests/supabase-public-read-boundary.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202607210001_publication_safety_and_run_recovery.sql";
const businessTables = [
  "plans", "participants", "candidate_cities", "recommendation_runs",
  "travel_options", "city_recommendations", "ai_explanations",
  "plan_credentials", "participant_credentials", "route_tasks", "verified_quotes",
  "agent_events", "recommendation_proposals", "recommendation_results",
  "recommendation_schemes", "recommendation_scheme_routes",
];

describe("Supabase public read boundary", () => {
  it("revokes direct table access from every public database role", async () => {
    const sql = (await readFile(migrationPath, "utf8")).toLowerCase();
    for (const table of businessTables) {
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
    }
  });

  it("removes broad policies and unused realtime membership from canonical schema", async () => {
    const schema = (await readFile("supabase/schema.sql", "utf8")).toLowerCase();
    expect(schema).not.toContain('create policy "public read');
    for (const table of ["participants", "candidate_cities", "recommendation_runs", "city_recommendations"]) {
      expect(schema).not.toContain(`alter publication supabase_realtime add table ${table}`);
    }
  });
});
```

Extend `tests/multi-agent-schema.test.ts` with explicit privilege assertions:

```ts
for (const name of [
  "create_recommendation_run_matrix",
  "save_route_task_outcome",
  "publish_shared_result",
  "confirm_alternative_result",
]) {
  expect(sql).toMatch(new RegExp(
    `revoke execute on function ${name}[\\s\\S]*?from public, anon, authenticated`,
  ));
  expect(sql).toMatch(new RegExp(
    `grant execute on function ${name}[\\s\\S]*?to service_role`,
  ));
}
expect(sql).not.toMatch(/grant\s+(?:select|all)[\s\S]*?to\s+(?:anon|authenticated)/);
```

- [ ] **Step 2: Run the schema tests and verify failure**

Run:

```bash
npm run test -- tests/supabase-public-read-boundary.test.ts tests/multi-agent-schema.test.ts
```

Expected: FAIL because the hardening migration does not exist and canonical schema still has broad read policies and four Realtime additions.

- [ ] **Step 3: Add the hardening migration and canonical revokes**

Update the permanent project rule first, before changing schema practice. Add this bullet beside the existing Supabase client boundary in `AGENTS.md`:

```markdown
- Public plan and shared-result reads go through server-rendered pages or `GET /api/plans/[code]`; browser `anon` / `authenticated` roles have no direct business-table or Realtime read access. Private previews remain available only through their credentialed server API.
```

Start `supabase/migrations/202607210001_publication_safety_and_run_recovery.sql` with explicit policy removal and table revokes:

```sql
drop policy if exists "public read plan by code" on public.plans;
drop policy if exists "public read participants" on public.participants;
drop policy if exists "public read candidate cities" on public.candidate_cities;
drop policy if exists "public read runs" on public.recommendation_runs;
drop policy if exists "public read travel options" on public.travel_options;
drop policy if exists "public read city recommendations" on public.city_recommendations;
drop policy if exists "public read shared recommendation results" on public.recommendation_results;
drop policy if exists "public read shared recommendation schemes" on public.recommendation_schemes;
drop policy if exists "public read shared recommendation scheme routes" on public.recommendation_scheme_routes;

revoke all on table public.plans from public, anon, authenticated;
revoke all on table public.participants from public, anon, authenticated;
revoke all on table public.candidate_cities from public, anon, authenticated;
revoke all on table public.recommendation_runs from public, anon, authenticated;
revoke all on table public.travel_options from public, anon, authenticated;
revoke all on table public.city_recommendations from public, anon, authenticated;
revoke all on table public.ai_explanations from public, anon, authenticated;
revoke all on table public.plan_credentials from public, anon, authenticated;
revoke all on table public.participant_credentials from public, anon, authenticated;
revoke all on table public.route_tasks from public, anon, authenticated;
revoke all on table public.verified_quotes from public, anon, authenticated;
revoke all on table public.agent_events from public, anon, authenticated;
revoke all on table public.recommendation_proposals from public, anon, authenticated;
revoke all on table public.recommendation_results from public, anon, authenticated;
revoke all on table public.recommendation_schemes from public, anon, authenticated;
revoke all on table public.recommendation_scheme_routes from public, anon, authenticated;
```

Use a guarded block for each current publication member so the migration is safe if membership already differs:

```sql
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'participants', 'candidate_cities', 'recommendation_runs', 'city_recommendations'
  ] loop
    if exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', v_table);
    end if;
  end loop;
end;
$$;
```

In `supabase/schema.sql`, remove the broad policies and publication additions, keep RLS enabled, and add the same explicit revokes for all business tables. Do not alter `service_role` function grants.

- [ ] **Step 4: Run focused schema tests**

Run:

```bash
npm run test -- tests/supabase-public-read-boundary.test.ts tests/multi-agent-schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the read-boundary hardening**

```bash
git add AGENTS.md tests/supabase-public-read-boundary.test.ts tests/multi-agent-schema.test.ts supabase/schema.sql supabase/migrations/202607210001_publication_safety_and_run_recovery.sql
git commit -m "fix: close anonymous Supabase reads"
```

---

### Task 3: Make Run Creation Atomic And Structured

**Files:**
- Modify: `tests/recommendation-run-schema.test.ts`
- Modify: `tests/recommendation-repository.test.ts`
- Modify: `tests/manager-agent.test.ts`
- Create: `tests/run-deadlines.test.ts`
- Modify: `supabase/migrations/202607210001_publication_safety_and_run_recovery.sql`
- Modify: `supabase/schema.sql`
- Create: `src/lib/recommendation/run-deadlines.ts`
- Modify: `src/lib/recommendation/repository.ts`
- Modify: `src/lib/agent/manager-agent.ts`

- [ ] **Step 1: Write failing structured-result tests**

Add static SQL assertions for these exact outcomes:

```ts
expect(sql).toContain("'disposition', 'created'");
expect(sql).toContain("'disposition', 'resume_existing'");
expect(sql).toContain("'disposition', 'rejected'");
expect(sql).toContain("'code', 'shared_result_exists'");
expect(sql).toContain("'code', 'shared_result_required'");
expect(sql).toContain("'code', 'calculation_in_progress'");
expect(sql).toContain("for update");
expect(sql).toContain("stale_after");
```

In `tests/recommendation-repository.test.ts`, mock the RPC and assert all three branches:

```ts
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_RUN_ID = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const repository = new SupabaseRecommendationRepository();
const input = {
  planId: "plan-1",
  arrivalDate: "2026-08-15",
  candidates: [{ cityCode: "wuhan", cityName: "武汉", source: "system" as const }],
  tasks: [{
    participantId: "p1", cityCode: "wuhan", originCityCode: "beijing",
    mode: "flight" as const, searchDate: "2026-08-14", arrivalDate: "2026-08-15",
    physicalKey: "beijing:wuhan:flight:2026-08-14",
  }],
};

mocks.rpc.mockResolvedValue({
  data: { disposition: "resume_existing", runId: RUN_ID, status: "collecting", taskIds: [] },
  error: null,
});
await expect(repository.createRunMatrix(input)).resolves.toMatchObject({
  disposition: "resume_existing", runId: RUN_ID, status: "collecting", taskIds: [],
});

mocks.rpc.mockResolvedValue({
  data: { disposition: "rejected", code: "SHARED_RESULT_EXISTS" },
  error: null,
});
await expect(repository.createRunMatrix(input)).rejects.toMatchObject({
  name: "RunCreationError", code: "SHARED_RESULT_EXISTS",
});
```

Add a table-driven malformed-result regression:

```ts
it.each([
  { disposition: "created", runId: RUN_ID, status: "collecting", taskIds: [TASK_ID] },
  { disposition: "resume_existing", runId: RUN_ID, status: "collecting", taskIds: [TASK_ID] },
  { disposition: "resume_existing", runId: RUN_ID, status: "completed", taskIds: [] },
  { disposition: "rejected", code: "UNKNOWN_CODE" },
])("rejects malformed run creation RPC data: %j", async (data) => {
  mocks.rpc.mockResolvedValue({ data, error: null });
  await expect(repository.createRunMatrix(input))
    .rejects.toThrow("invalid RPC result");
});

it("rejects a created run ID that differs from the requested ID", async () => {
  mocks.rpc.mockResolvedValue({
    data: { disposition: "created", runId: OTHER_RUN_ID, status: "pending", taskIds: [TASK_ID] },
    error: null,
  });
  await expect(repository.createRunMatrix(input)).rejects.toThrow("invalid RPC result");
});
```

Add `tests/run-deadlines.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { staleAfterForStatus } from "@/lib/recommendation/run-deadlines";

const now = new Date("2026-08-01T00:00:00.000Z");

describe("recommendation run deadlines", () => {
  it("uses 15 minutes for active processing and 7 days for host confirmation", () => {
    expect(staleAfterForStatus("collecting", now)).toBe("2026-08-01T00:15:00.000Z");
    expect(staleAfterForStatus("awaiting_host_confirmation", now))
      .toBe("2026-08-08T00:00:00.000Z");
  });

  it.each(["completed", "incomplete", "failed"] as const)(
    "clears the deadline for %s",
    (status) => expect(staleAfterForStatus(status, now)).toBeNull(),
  );
});
```

Update `tests/manager-agent.test.ts` so `ManagerAgent.prepare` returns `disposition`, `status`, and `taskIds` unchanged from the repository.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
npm run test -- tests/recommendation-run-schema.test.ts tests/recommendation-repository.test.ts tests/manager-agent.test.ts tests/run-deadlines.test.ts
```

Expected: FAIL because the RPC returns only `{ runId, taskIds }`, the repository has no discriminated union, and `stale_after` is not selected.

- [ ] **Step 3: Add strict TypeScript run-creation contracts**

Create `src/lib/recommendation/run-deadlines.ts` first:

```ts
import type { RunStatus } from "@/lib/agent/contracts";

export const ACTIVE_RUN_STALE_MS = 15 * 60 * 1000;
export const PREVIEW_CONFIRMATION_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function staleAfterForStatus(status: RunStatus, now: Date): string | null {
  if (["completed", "incomplete", "failed"].includes(status)) return null;
  const ttl = status === "awaiting_host_confirmation"
    ? PREVIEW_CONFIRMATION_STALE_MS
    : ACTIVE_RUN_STALE_MS;
  return new Date(now.getTime() + ttl).toISOString();
}
```

In `src/lib/recommendation/repository.ts`, define the closed types:

```ts
export const runCreationErrorCodes = [
  "CALCULATION_IN_PROGRESS",
  "SHARED_RESULT_EXISTS",
  "SHARED_RESULT_REQUIRED",
] as const;
export type RunCreationErrorCode = typeof runCreationErrorCodes[number];

export type ActiveRunStatus = Exclude<RunStatus, "completed" | "incomplete" | "failed">;

export type PreparedRun =
  | { disposition: "created"; runId: string; status: "pending"; taskIds: string[] }
  | { disposition: "resume_existing"; runId: string; status: ActiveRunStatus; taskIds: [] };

export class RunCreationError extends Error {
  constructor(readonly code: RunCreationErrorCode) {
    super(code);
    this.name = "RunCreationError";
  }
}
```

Build a strict Zod union for RPC data. Use a refinement to require non-empty task IDs for `created`, exact `pending` status for `created`, an active nonterminal status plus an empty tuple/array for `resume_existing`, and rejection codes from the allowlist. A terminal `resume_existing` payload must fail closed. Throw `RunCreationError` only for a valid `rejected` branch.

Add `staleAfter: string | null` to `StoredRecommendationRun`, add `stale_after` to `RUN_SELECT`, and parse only a string or null. Change `RecommendationRepository.createRunMatrix` and `ManagerAgent.prepare` to return `PreparedRun`.

- [ ] **Step 4: Replace run-creation SQL inside the existing transaction**

In both the new migration and canonical schema, replace `create_recommendation_run_matrix` while retaining its existing bounded candidate/task validation. Add `v_active_run` and `v_has_shared_result` to the existing `declare` block. Insert the guard block immediately before the current `insert into public.recommendation_runs` statement, after every plan/requester/candidate/task validation has passed:

```sql
select exists (
    select 1
    from public.recommendation_results
    where plan_id = p_plan_id
      and is_shared
      and superseded_at is null
  ) into v_has_shared_result;

if p_kind = 'automatic' and v_has_shared_result then
    return jsonb_build_object('disposition', 'rejected', 'code', 'SHARED_RESULT_EXISTS');
end if;
if p_kind = 'alternative' and not v_has_shared_result then
    return jsonb_build_object('disposition', 'rejected', 'code', 'SHARED_RESULT_REQUIRED');
end if;

select * into v_active_run
  from public.recommendation_runs
  where plan_id = p_plan_id
    and status in (
      'pending', 'collecting', 'cooling_down', 'calculating',
      'validating', 'awaiting_host_confirmation'
    )
for update;

if found and v_active_run.stale_after <= now() then
    update public.recommendation_runs
    set status = 'failed', error_summary = 'RUN_STALE_EXPIRED', completed_at = now(),
        stale_after = null, advance_lease_token = null, advance_lease_expires_at = null
    where id = v_active_run.id and status = v_active_run.status;
    v_active_run := null;
end if;

if v_active_run.id is not null then
    if v_active_run.kind = p_kind and (
      p_kind = 'automatic'
      or (
        v_active_run.requested_city_code = p_requested_city_code
        and v_active_run.requested_by_participant_id = p_requested_by_participant_id
      )
    ) then
      return jsonb_build_object(
        'disposition', 'resume_existing', 'runId', v_active_run.id,
        'status', v_active_run.status, 'taskIds', '[]'::jsonb
      );
    end if;
    return jsonb_build_object('disposition', 'rejected', 'code', 'CALCULATION_IN_PROGRESS');
end if;
```

Insert new runs with `stale_after = now() + interval '15 minutes'`. Return:

```sql
return jsonb_build_object(
  'disposition', 'created',
  'runId', p_run_id,
  'status', 'pending',
  'taskIds', (
    select coalesce(jsonb_agg(entry.value -> 'id' order by entry.ordinality), '[]'::jsonb)
    from jsonb_array_elements(p_tasks) with ordinality as entry(value, ordinality)
  )
);
```

Backfill current active rows in the migration:

```sql
update public.recommendation_runs
set stale_after = started_at + case
  when status = 'awaiting_host_confirmation' then interval '7 days'
  else interval '15 minutes'
end
where status in (
  'pending', 'collecting', 'cooling_down', 'calculating',
  'validating', 'awaiting_host_confirmation'
)
and stale_after is null;
```

Keep the partial unique active-run index as the final concurrency backstop.

- [ ] **Step 5: Run focused contract tests**

Run:

```bash
npm run test -- tests/recommendation-run-schema.test.ts tests/recommendation-repository.test.ts tests/manager-agent.test.ts tests/run-deadlines.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the atomic creation boundary**

```bash
git add supabase/schema.sql supabase/migrations/202607210001_publication_safety_and_run_recovery.sql src/lib/recommendation/run-deadlines.ts src/lib/recommendation/repository.ts src/lib/agent/manager-agent.ts tests/recommendation-run-schema.test.ts tests/recommendation-repository.test.ts tests/manager-agent.test.ts tests/run-deadlines.test.ts
git commit -m "fix: make run creation atomic"
```

---

### Task 4: Enforce Creation Guards In APIs And Fallback

**Files:**
- Modify: `tests/calculate-route.test.ts`
- Modify: `tests/alternative-preview-route.test.ts`
- Modify: `tests/fallback-calculation-lock.test.ts`
- Modify: `tests/fallback-publication-guard.test.ts`
- Modify: `src/lib/agent/run-orchestrator.ts`
- Modify: `src/lib/recommendation/alternative-preview.ts`
- Modify: `src/lib/recommendation/calculate-run.ts`
- Modify: `src/lib/fallback/mvp-store.ts`
- Modify: `src/app/api/plans/[code]/calculate/route.ts`
- Modify: `src/app/api/plans/[code]/previews/route.ts`
- Modify: `src/components/result/AlternativeCityFlow.tsx`

- [ ] **Step 1: Write failing API disposition tests**

In `tests/calculate-route.test.ts`, mock these results and assert status codes:

```ts
mocks.calculatePlanRecommendations.mockResolvedValue({
  disposition: "created", runId: "run-1", status: "pending",
});
expect(response.status).toBe(202);

mocks.calculatePlanRecommendations.mockResolvedValue({
  disposition: "resume_existing", runId: "run-1", status: "collecting",
});
expect(response.status).toBe(200);
```

Assert `SHARED_RESULT_EXISTS` returns HTTP 409. In `tests/alternative-preview-route.test.ts`, assert the same `202/200` split plus HTTP 409 for `SHARED_RESULT_REQUIRED` and `CALCULATION_IN_PROGRESS`.

- [ ] **Step 2: Write failing fallback parity tests**

Add cases that:

```ts
const first = await calculateFallbackRecommendations(code);
const resumed = await calculateFallbackRecommendations(code);
expect(resumed).toEqual({
  disposition: "resume_existing",
  runId: first.runId,
  status: "pending",
});
```

Then complete the first automatic result and assert:

```ts
await expect(calculateFallbackRecommendations(code))
  .rejects.toThrow("SHARED_RESULT_EXISTS");
```

Before any shared result, assert `createFallbackAlternativePreview` throws `SHARED_RESULT_REQUIRED`. After a shared result, assert the same requester/city resumes, while a different requester or city throws `CALCULATION_IN_PROGRESS` without returning the private run ID.

- [ ] **Step 3: Run focused API and fallback tests to verify failure**

Run:

```bash
npm run test -- tests/calculate-route.test.ts tests/alternative-preview-route.test.ts tests/fallback-calculation-lock.test.ts tests/fallback-publication-guard.test.ts
```

Expected: FAIL because APIs always return 202, fallback treats duplicate active work only as an error, alternative creation has no shared-result precondition, and automatic creation still succeeds after publication.

- [ ] **Step 4: Propagate durable creation dispositions**

Change `startAutomaticRun` and `createAlternativePreview` to map `PreparedRun` to:

```ts
export type RunCreationResult = {
  disposition: "created" | "resume_existing";
  runId: string;
  status: RunStatus;
};
```

Delete duplicate-key message parsing from both functions. Catch only `RunCreationError` when translating known domain errors; rethrow unexpected failures.

In both HTTP create routes:

```ts
return NextResponse.json(result, {
  status: result.disposition === "created" ? 202 : 200,
});
```

Map all three creation error codes to 409. In `AlternativeCityFlow`, initialize the preview from the server result instead of forcing `pending`:

```ts
setPreview({
  runId: json.runId,
  status: json.status,
  pendingGroups: 0,
  result: null,
});
```

- [ ] **Step 5: Implement fallback creation parity with a deterministic clock**

Add test-only clock control without exposing it to browser code:

```ts
let fallbackNow: (() => Date) | null = null;
function nowDate() { return fallbackNow?.() ?? new Date(); }
function timestamp() { return nowDate().toISOString(); }
export function setFallbackNowForTests(now: (() => Date) | null) { fallbackNow = now; }
```

Add `staleAfter` to `RunRow`. Implement a shared fallback creation guard:

```ts
function expireActiveRun(run: RunRow) {
  run.status = "failed";
  run.errorCode = "RUN_STALE_EXPIRED";
  run.completedAt = timestamp();
  run.staleAfter = null;
}

function activeRunForPlan(planId: string) {
  return state().runs.find((run) => run.planId === planId && activeStatuses.has(run.status)) ?? null;
}
```

Creation must check the current shared result first, expire only an actually expired active run, return `resume_existing` only for the approved kind/requester/city match, and otherwise throw the safe code. New runs use `staleAfter = now + 15 minutes`; `awaiting_host_confirmation` later switches to 7 days.

Reset the injected clock in every fallback test `beforeEach`/`afterEach` to prevent cross-test leakage.

- [ ] **Step 6: Run focused API and fallback tests**

Run:

```bash
npm run test -- tests/calculate-route.test.ts tests/alternative-preview-route.test.ts tests/fallback-calculation-lock.test.ts tests/fallback-publication-guard.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit creation parity**

```bash
git add src/lib/agent/run-orchestrator.ts src/lib/recommendation/alternative-preview.ts src/lib/recommendation/calculate-run.ts src/lib/fallback/mvp-store.ts 'src/app/api/plans/[code]/calculate/route.ts' 'src/app/api/plans/[code]/previews/route.ts' src/components/result/AlternativeCityFlow.tsx tests/calculate-route.test.ts tests/alternative-preview-route.test.ts tests/fallback-calculation-lock.test.ts tests/fallback-publication-guard.test.ts
git commit -m "fix: enforce recommendation run guards"
```

---

### Task 5: Continue After A Route Exhausts Recovery

**Files:**
- Modify: `tests/run-orchestrator.test.ts`
- Modify: `tests/recommendation-repository.test.ts`
- Modify: `tests/multi-agent-schema.test.ts`
- Modify: `supabase/migrations/202607210001_publication_safety_and_run_recovery.sql`
- Modify: `supabase/schema.sql`
- Modify: `src/lib/recommendation/repository.ts`
- Modify: `src/lib/agent/run-orchestrator.ts`

- [ ] **Step 1: Replace the incorrect recovery regression with failing desired behavior**

Replace the test that expects one exhausted route to end the run. Use one exhausted route plus another pending route:

```ts
it("terminalizes one exhausted route and continues other pending work", async () => {
  const exhausted = task({
    id: "exhausted", status: "retryable_failure", attemptCount: 3,
    retryAfter: null, errorCode: "PROVIDER_TIMEOUT",
  });
  const pending = task({ id: "pending", participantId: "p2", status: "pending" });
  const store = repository({ current: run("collecting"), tasks: [exhausted, pending] });
  const terminalize = vi.fn(async () => true);
  const execute = vi.fn(async () => ({ status: "empty" as const }));
  store.markTaskRecoveryExhausted = terminalize;

  await expect(new RunOrchestrator({ repository: store, query: { execute } })
    .advanceRun("run-1")).resolves.toBe("collecting");

  expect(terminalize).toHaveBeenCalledWith("exhausted", "PROVIDER_TIMEOUT", expect.any(String));
  expect(execute).toHaveBeenCalledWith("pending");
  expect(store.transitions).toEqual([]);
});
```

Add the exhausted-only terminalization case:

```ts
it("becomes incomplete only after every remaining route is terminal", async () => {
  const store = repository({ current: run("collecting"), tasks: [
    task({
      id: "exhausted", status: "retryable_failure", attemptCount: 3,
      retryAfter: null, errorCode: "PROVIDER_TIMEOUT",
    }),
  ] });
  store.markTaskRecoveryExhausted = vi.fn(async () => true);
  const execute = vi.fn(async () => ({ status: "empty" as const }));

  await expect(new RunOrchestrator({ repository: store, query: { execute } })
    .advanceRun("run-1")).resolves.toBe("incomplete");
  expect(store.markTaskRecoveryExhausted).toHaveBeenCalledOnce();
  expect(execute).not.toHaveBeenCalled();
});
```

Keep the existing cooldown test as the regression for future `wait_until`, and keep `starts calculation when at least one candidate has complete real coverage` as the later-coverage regression. Extend the existing plan-read pending-count assertion to continue requiring exactly `["pending", "running", "retryable_failure"]`; `terminal_failure` must never be added.

- [ ] **Step 2: Run orchestrator tests and verify failure**

Run:

```bash
npm run test -- tests/run-orchestrator.test.ts tests/recommendation-repository.test.ts tests/multi-agent-schema.test.ts
```

Expected: FAIL because any `stop_incomplete` currently terminates the whole run and the repository lacks a terminalization method.

- [ ] **Step 3: Add the atomic exhausted-task helper**

Add a service-only SQL function in the new migration and canonical schema:

```sql
create function terminalize_route_task_recovery(
  p_task_id uuid,
  p_error_code text,
  p_stale_after timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  update public.route_tasks
  set status = 'terminal_failure', retry_after = null,
      error_code = coalesce(nullif(btrim(p_error_code), ''), 'ROUTE_RECOVERY_EXHAUSTED'),
      updated_at = now()
  where id = p_task_id and status = 'retryable_failure'
  returning run_id into v_run_id;
  if not found then return false; end if;

  update public.recommendation_runs
  set stale_after = p_stale_after
  where id = v_run_id
    and status in ('pending', 'collecting', 'cooling_down', 'calculating', 'validating');
  return true;
end;
$$;
```

Revoke execution from public roles and grant only `service_role`. Add repository method:

```ts
markTaskRecoveryExhausted(
  taskId: string,
  errorCode: string,
  staleAfter: string,
): Promise<boolean>;
```

Parse only literal boolean RPC output; throw on database errors or invalid data.

- [ ] **Step 4: Continue ready or waiting work after terminalization**

Import the shared active inactivity constant from `run-deadlines.ts`, then refactor `collect` into this order:

```ts
import { ACTIVE_RUN_STALE_MS } from "@/lib/recommendation/run-deadlines";

const stopped = [...recovery.entries()]
  .filter(([, action]) => action.type === "stop_incomplete");
await Promise.all(stopped.map(([taskId]) => {
  const task = tasks.find((entry) => entry.id === taskId)!;
  return this.repository.markTaskRecoveryExhausted(
    taskId,
    task.errorCode ?? "ROUTE_RECOVERY_EXHAUSTED",
    new Date(this.now().getTime() + ACTIVE_RUN_STALE_MS).toISOString(),
  );
}));

const ready = tasks.filter((task) =>
  task.status === "pending" || recovery.get(task.id)?.type === "rerun_task",
);
```

Do not return incomplete merely because `stopped` is non-empty. Execute one ready batch, otherwise honor the earliest wait, otherwise transition to incomplete. Keep the existing complete-coverage check first.

- [ ] **Step 5: Run focused recovery tests**

Run:

```bash
npm run test -- tests/run-orchestrator.test.ts tests/recommendation-repository.test.ts tests/multi-agent-schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit route recovery**

```bash
git add src/lib/agent/run-orchestrator.ts src/lib/recommendation/repository.ts supabase/schema.sql supabase/migrations/202607210001_publication_safety_and_run_recovery.sql tests/run-orchestrator.test.ts tests/recommendation-repository.test.ts tests/multi-agent-schema.test.ts
git commit -m "fix: continue healthy route recovery"
```

---

### Task 6: Enforce Stale Deadlines During Advance And Confirmation

**Files:**
- Modify: `tests/run-orchestrator.test.ts`
- Modify: `tests/recommendation-repository.test.ts`
- Modify: `tests/host-confirmation.test.ts`
- Modify: `tests/host-confirmation-route.test.ts`
- Modify: `supabase/migrations/202607210001_publication_safety_and_run_recovery.sql`
- Modify: `supabase/schema.sql`
- Modify: `src/lib/recommendation/repository.ts`
- Modify: `src/lib/agent/run-orchestrator.ts`
- Modify: `src/lib/security/host-confirmation.ts`
- Modify: `src/lib/fallback/mvp-store.ts`
- Modify: `src/app/api/plans/[code]/previews/[runId]/confirm/route.ts`

- [ ] **Step 1: Write failing stale-advance tests**

Extend the test run fixture with `staleAfter`. Add:

```ts
it("fails an expired active run before acquiring a lease", async () => {
  const store = repository({
    current: { ...run("collecting"), staleAfter: "2026-08-01T00:00:00.000Z" },
  });
  const expire = vi.fn(async () => {
    store.current = { ...store.current, status: "failed", staleAfter: null };
    return true;
  });
  store.expireStaleRun = expire;

  await expect(new RunOrchestrator({
    repository: store,
    now: () => new Date("2026-08-01T00:00:01.000Z"),
  }).advanceRun("run-1")).resolves.toBe("failed");

  expect(expire).toHaveBeenCalledWith(
    "run-1", "collecting", "2026-08-01T00:00:01.000Z",
  );
  expect(store.leased).toBe(false);
});
```

Add repository payload assertions using a fixed clock value:

```ts
const LEASE_TOKEN = "44444444-4444-4444-8444-444444444444";

expect(update).toHaveBeenCalledWith(expect.objectContaining({
  advance_lease_token: LEASE_TOKEN,
  advance_lease_expires_at: "2026-08-01T00:05:00.000Z",
  stale_after: "2026-08-01T00:15:00.000Z",
}));

expect(statusUpdate).toHaveBeenCalledWith(expect.objectContaining({
  status: "awaiting_host_confirmation",
  stale_after: "2026-08-08T00:00:00.000Z",
}));

expect(terminalUpdate).toHaveBeenCalledWith(expect.objectContaining({
  status: "failed",
  stale_after: null,
}));
```

- [ ] **Step 2: Write failing preview-expiry tests**

With the deterministic fallback clock, advance an alternative to `awaiting_host_confirmation`, move time past 7 days, and assert:

```ts
await expect(confirmFallbackAlternative({
  runId: preview.runId,
  hostToken: plan.hostToken,
})).rejects.toThrow("PREVIEW_EXPIRED");
```

Keep the existing repeated completed confirmation test green. In the route test, assert `PREVIEW_EXPIRED` maps to HTTP 409.

- [ ] **Step 3: Run stale tests and verify failure**

Run:

```bash
npm run test -- tests/run-orchestrator.test.ts tests/recommendation-repository.test.ts tests/host-confirmation.test.ts tests/host-confirmation-route.test.ts
```

Expected: FAIL because `stale_after` is not enforced or refreshed and confirmation does not detect expiry.

- [ ] **Step 4: Add stale helpers and transition deadlines**

Import the shared constants and deadline helper created in Task 3:

```ts
import {
  ACTIVE_RUN_STALE_MS,
  PREVIEW_CONFIRMATION_STALE_MS,
  staleAfterForStatus,
} from "@/lib/recommendation/run-deadlines";
```

Before lease acquisition, expire a run when `staleAfter <= now`. Add repository CAS:

```ts
expireStaleRun(runId: string, expectedStatus: RunStatus, now: string): Promise<boolean>;
```

Its update must require the expected status and `stale_after <= now`, then set `failed`, `RUN_STALE_EXPIRED`, `completed_at`, and clear both lease fields and `stale_after`.

Pass a fresh deadline into lease acquisition and every orchestrator state transition. Extend the repository contracts explicitly:

```ts
tryAcquireAdvanceLease(input: {
  runId: string;
  expectedStatus: RunStatus;
  token: string;
  now: string;
  expiresAt: string;
  staleAfter: string;
}): Promise<boolean>;

compareAndSetRunStatus(
  runId: string,
  expectedStatus: RunStatus,
  nextStatus: RunStatus,
  options?: {
    retryAfter?: string | null;
    errorCode?: string | null;
    staleAfter?: string | null;
  },
): Promise<boolean>;
```

`RunOrchestrator` computes both values from its injected `now`, so tests remain deterministic. Both database writes set `stale_after` in the same update; terminal transitions pass null. Update the repository's `updateRunStatus` implementation, which QueryAgent uses for cooldown transitions, to call `staleAfterForStatus(status, new Date())` in the same database update.

Update `save_route_task_outcome` SQL to refresh the owning nonterminal run's `stale_after` by 15 minutes only after the task outcome and quotes persist successfully.

- [ ] **Step 5: Reject expired confirmation at both application and database boundaries**

Select `stale_after` in `host-confirmation.ts`. Preserve completed idempotency first. For an already expired `awaiting_host_confirmation` row, call `expireStaleRun`; if a concurrent writer wins, reload the run and return completed only when it is now completed/shared. Otherwise throw `PREVIEW_EXPIRED`.

Close the check-to-RPC race without parsing PostgreSQL messages. In the new migration, drop and recreate `confirm_alternative_result(uuid, uuid, text)` with return type `jsonb`; keep all existing credential, proposal, evidence, and replacement guards. After host credential validation and the locked run read, add:

```sql
if v_run.status = 'awaiting_host_confirmation'
  and (v_run.stale_after is null or v_run.stale_after <= now())
then
  update public.recommendation_runs
  set status = 'failed', error_summary = 'RUN_STALE_EXPIRED', completed_at = now(),
      stale_after = null, advance_lease_token = null, advance_lease_expires_at = null
  where id = p_run_id and status = 'awaiting_host_confirmation';
  return jsonb_build_object('disposition', 'rejected', 'code', 'PREVIEW_EXPIRED');
end if;
```

Replace the successful UUID return with:

```sql
return jsonb_build_object(
  'disposition', 'completed',
  'resultId', v_result.id
);
```

Reapply the existing public-role revoke and `service_role` grant after recreation. Parse the RPC response with a strict Zod union:

```ts
const confirmationResultSchema = z.discriminatedUnion("disposition", [
  z.object({ disposition: z.literal("completed"), resultId: z.uuid() }).strict(),
  z.object({
    disposition: z.literal("rejected"),
    code: z.literal("PREVIEW_EXPIRED"),
  }).strict(),
]);
```

Throw `PREVIEW_EXPIRED` for the rejected branch and `HOST_CONFIRMATION_FAILED` for malformed data. In fallback confirmation, perform the same completed-first, expiry-second ordering and clear `staleAfter` on completion.

- [ ] **Step 6: Run focused stale tests**

Run:

```bash
npm run test -- tests/run-orchestrator.test.ts tests/recommendation-repository.test.ts tests/host-confirmation.test.ts tests/host-confirmation-route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit stale-run enforcement**

```bash
git add src/lib/agent/run-orchestrator.ts src/lib/recommendation/repository.ts src/lib/security/host-confirmation.ts src/lib/fallback/mvp-store.ts 'src/app/api/plans/[code]/previews/[runId]/confirm/route.ts' supabase/schema.sql supabase/migrations/202607210001_publication_safety_and_run_recovery.sql tests/run-orchestrator.test.ts tests/recommendation-repository.test.ts tests/host-confirmation.test.ts tests/host-confirmation-route.test.ts
git commit -m "fix: expire stale recommendation runs"
```

---

### Task 7: Lock The Public Projection And User Feedback

**Files:**
- Modify: `tests/plan-read-route.test.ts`
- Modify: `tests/api-error-message.test.ts`
- Modify: `src/app/api/plans/[code]/route.ts`
- Modify: `src/lib/ui/api-error-message.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/integration-guide.md`

- [ ] **Step 1: Write failing public-projection and copy tests**

Add a plan-read regression with both a current shared result and a newer private alternative run in mocks. Assert the response stays anchored to the shared run and the serialized JSON contains none of:

```ts
expect(body).not.toHaveProperty("kind");
expect(JSON.stringify(body)).not.toContain("requested_by_participant_id");
expect(JSON.stringify(body)).not.toContain("requested_city_code");
expect(JSON.stringify(body)).not.toContain("alternative");
```

Assert the run query selects only the owning shared run when a shared result exists and only latest `kind = automatic` before publication.

Add exact Chinese error-copy expectations:

```ts
expect(getApiErrorMessage("SHARED_RESULT_EXISTS", "失败"))
  .toBe("已经选好见面城市了，去看结果或换个城市看看");
expect(getApiErrorMessage("SHARED_RESULT_REQUIRED", "失败"))
  .toBe("先完成第一次见面安排，再换个城市看看");
expect(getApiErrorMessage("PREVIEW_EXPIRED", "失败"))
  .toBe("这份预览已经过期，请重新生成一次");
```

- [ ] **Step 2: Run focused projection tests and verify failure**

Run:

```bash
npm run test -- tests/plan-read-route.test.ts tests/api-error-message.test.ts
```

Expected: copy assertions FAIL; the projection test may expose any accidental private-run query or pass as a guard for the existing correct projection.

- [ ] **Step 3: Keep the HTTP projection explicit and add actionable copy**

Do not broaden `GET /api/plans/[code]`. Keep the service-role selects as explicit allowlists. If the shared-result regression exposes a query ordering gap, select the current shared result first and then fetch its exact owning run ID. Before publication, filter runs with `.eq("kind", "automatic")`.

Add the three exact messages to `apiErrorMessages`. Do not add internal metadata to responses or copy.

- [ ] **Step 4: Synchronize stable documentation**

Update `docs/architecture.md` and `docs/integration-guide.md` with:

- API-only public projection and removal of browser table reads/Realtime membership;
- `created` versus `resume_existing` response semantics;
- automatic/shared and alternative/shared preconditions;
- 15-minute active and 7-day confirmation deadlines;
- per-route recovery exhaustion behavior; and
- new safe error codes.

State explicitly that migration application and live supplier acceptance are not part of this batch.

- [ ] **Step 5: Run focused projection tests**

Run:

```bash
npm run test -- tests/plan-read-route.test.ts tests/api-error-message.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit projection and documentation**

```bash
git add 'src/app/api/plans/[code]/route.ts' src/lib/ui/api-error-message.ts tests/plan-read-route.test.ts tests/api-error-message.test.ts docs/architecture.md docs/integration-guide.md
git commit -m "docs: define safe run recovery flow"
```

---

### Task 8: Run Full Gates And Close The Batch Ledger

**Files:**
- Modify: `.superpowers/sdd/progress.md`
- Verify: all Batch A files above

- [ ] **Step 1: Run root lint and tests**

Run:

```bash
npm run lint
npm run test
```

Expected: PASS with no skipped Batch A regression. Record the actual test-file and test counts from output; do not reuse historical counts.

- [ ] **Step 2: Run root production build**

Run:

```bash
npm run build
```

Expected: PASS. If the managed sandbox blocks Turbopack local process/port creation, rerun the identical command with the required approval and report both the sandbox limitation and final result.

- [ ] **Step 3: Run gateway lint, tests, and build**

Working directory: `services/travel-provider-gateway/`

Run:

```bash
npm run lint
npm run test
npm run build
```

Expected: PASS with the new multi-segment regressions included.

- [ ] **Step 4: Run diff and secret checks**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Inspect every staged path before the final commit. Search staged content for JWT-like strings, `sk-`, `sb_secret_`, passwords, API keys, authorization headers, and raw supplier payloads. Expected: no secrets or generated gateway artifacts.

- [ ] **Step 5: Update the authoritative progress ledger without overwriting existing work**

Append a Batch A implementation record under `Repository Security And State-Machine Audit` containing:

- implementation commit range;
- focused and full gate results with current counts;
- confirmation that both Critical findings are fixed locally;
- confirmation that all six Batch A items are covered;
- explicit statements that remote migration state was not queried/applied and live supplier acceptance was not run; and
- remaining Batch B and Batch C scope unchanged.

Before staging, run:

```bash
git diff -- .superpowers/sdd/progress.md
```

Expected: the user's pre-existing `/neat` edits remain intact and only the new Batch A completion record is added.

- [ ] **Step 6: Commit final verification documentation**

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs: record publication safety verification"
```

- [ ] **Step 7: Report completion accurately**

The final report must include:

- the behavior fixed and its user impact;
- root and gateway lint/test/build results with actual counts;
- the local migration filename, explicitly marked not applied or checked remotely;
- no claim of live supplier publication acceptance; and
- any remaining unrelated dirty worktree files.
