# Multi-Agent Unique-City Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current target-time, estimated-fallback, three-city flow with an auditable Multi-Agent workflow that publishes one city with exactly one saving scheme and one fast scheme only from complete verified real quotes.

**Architecture:** Keep supplier execution and evidence normalization inside the isolated travel gateway, and add a server-only agent runtime whose Manager orchestrates bounded Query work, deterministic policy tools, Calculation proposals, Supervisor review, recovery, and atomic publication. Persist route tasks, verified quotes, agent traces, versioned proposals, one result, two schemes, and selected quote references so every completed result can be replayed; private alternative-city previews use the same pipeline and become shared only through a host-authorized atomic transition.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zod 4, Supabase/PostgreSQL, OpenAI-compatible DeepSeek client, Vitest 4, isolated Node 20 travel gateway.

## Global Constraints

- User-facing copy is Chinese; code, files, variables, and commit messages are English.
- Plans contain an arrival date and no target arrival time.
- Flight and high-speed-rail searches use the arrival date and previous date; normal-train searches use the arrival date and previous two dates.
- Feasible quotes arrive on the selected date in `Asia/Shanghai`.
- Published schemes contain only verified real quotes and complete participant coverage; estimates never enter ranking or publication.
- A completed shared result contains exactly one city and exactly two schemes named `saving` and `fast`; average fare is not a UI metric.
- Saving uses direct-first eligibility and the exact `price * 10 <= minimum_price * 11` threshold.
- Fast uses direct-first eligibility and the exact `total_price * 10 <= saving_total * 13` cap.
- Supplier and model secrets stay server-side; prompts and traces exclude raw provider payloads and unnecessary participant identity.
- The gateway owns supplier credentials, CLI/MCP execution, validation, timeout, retry, cache, cooldown, stable errors, and physical concurrency; supplier calls remain globally serial.
- The gateway cannot generate candidates, select routes, score cities, call a model, or persist participant identity.
- Recommendation cards and the shared result entry appear only when the latest shared run is `completed`.
- DeepSeek is accessed only behind `AgentModel`; no workflow contract imports a DeepSeek SDK type.
- Root and gateway changes must each pass `npm run lint`, `npm run test`, and `npm run build`.

## File And Responsibility Map

- `supabase/migrations/202607150001_multi_agent_recommendation.sql`: additive schema, credential isolation, state constraints, indexes, RLS, and atomic publication/confirmation functions.
- `supabase/migrations/202607150002_remove_target_arrival_time.sql`: final contract cleanup after application compatibility is deployed.
- `src/types/domain.ts`: shared public domain types only.
- `src/lib/agent/contracts.ts`: strict agent inputs, outputs, run states, tool results, and policy version.
- `src/lib/agent/model.ts`, `deepseek-model.ts`: provider-neutral model boundary and first provider.
- `src/lib/agent/trace.ts`: redacted agent/tool event persistence.
- `src/lib/agent/manager-agent.ts`, `query-agent.ts`, `calculation-agent.ts`, `supervisor-agent.ts`, `fallback-agent.ts`: bounded specialist responsibilities.
- `src/lib/agent/run-orchestrator.ts`: code-controlled state machine and concurrency pool.
- `src/lib/recommendation/query-matrix.ts`: candidate/participant/mode/departure-date task expansion.
- `src/lib/recommendation/policy.ts`: direct-first, saving, fast, and unique-city deterministic reference implementation.
- `src/lib/recommendation/validators.ts`: arithmetic, date, evidence, proposal, and publication guardrails.
- `src/lib/recommendation/repository.ts`: Supabase persistence and RPC calls; no policy decisions.
- `src/lib/recommendation/travel-search.ts`: execute one normalized task and return structured outcomes; remove estimate fallback.
- `services/travel-provider-gateway/src/contracts.ts`, `flyai-adapter.ts`, `service.ts`, `server.ts`: departure-date request, quote evidence IDs, retry metadata, and existing serial controls.
- `src/app/api/plans/**`: create, calculate, status, preview, and host-confirmation HTTP boundaries.
- `src/components/result/**`, `src/app/p/[code]/**`: progress, one-city/two-scheme shared result, private preview, and host confirmation UI.
- `src/lib/fallback/mvp-store.ts`: local development persistence with the same states and publication invariants, never estimated completed results.
- `docs/architecture.md`, `docs/integration-guide.md`, `README.md`: update only after the new flow is implemented and accepted.

---

### Task 1: Freeze Contracts And Add The Additive Database Migration

**Files:**
- Create: `src/lib/agent/contracts.ts`
- Create: `supabase/migrations/202607150001_multi_agent_recommendation.sql`
- Modify: `supabase/schema.sql`
- Modify: `src/types/domain.ts`
- Test: `tests/multi-agent-schema.test.ts`
- Test: `tests/agent-contracts.test.ts`

**Interfaces:**
- Produces: `POLICY_VERSION`, `RunStatus`, `RouteTask`, `VerifiedQuote`, `RecommendationProposal`, `SchemeProposal`, `ValidationDecision`.
- Produces database tables: `plan_credentials`, `participant_credentials`, `route_tasks`, `verified_quotes`, `agent_events`, `recommendation_proposals`, `recommendation_results`, `recommendation_schemes`, `recommendation_scheme_routes`.
- Produces RPCs: `publish_shared_result(p_run_id uuid, p_proposal_id uuid)` and `confirm_alternative_result(p_run_id uuid, p_proposal_id uuid, p_host_token_hash text)`.

- [ ] **Step 1: Write schema and contract tests that fail before the migration exists**

```ts
// tests/agent-contracts.test.ts
import { describe, expect, it } from "vitest";
import { calculationOutputSchema, POLICY_VERSION, runStatusSchema } from "@/lib/agent/contracts";

describe("multi-agent contracts", () => {
  it("accepts exactly one city with saving and fast schemes", () => {
    expect(POLICY_VERSION).toBe("2026-07-15.v1");
    expect(runStatusSchema.parse("awaiting_host_confirmation")).toBe("awaiting_host_confirmation");
    expect(calculationOutputSchema.parse({
      status: "proposal",
      cityCode: "shanghai",
      schemes: [
        { kind: "saving", quoteIdsByParticipant: { p1: "q1", p2: "q2" }, totalFareCny: 800 },
        { kind: "fast", quoteIdsByParticipant: { p1: "q3", p2: "q4" }, totalFareCny: 980 },
      ],
      comparisonEvidence: { eligibleCityCodes: ["shanghai"], orderedCityCodes: ["shanghai"] },
      explanationZh: "上海满足全员真实路线并符合省钱与省时策略。",
    }).schemes).toHaveLength(2);
  });
});
```

```ts
// tests/multi-agent-schema.test.ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("multi-agent migration", () => {
  it("stores evidence and makes publication an atomic guarded RPC", async () => {
    const sql = await readFile("supabase/migrations/202607150001_multi_agent_recommendation.sql", "utf8");
    for (const fragment of [
      "create table verified_quotes",
      "create table recommendation_schemes",
      "check (kind in ('saving', 'fast'))",
      "create function publish_shared_result",
      "create function confirm_alternative_result",
      "revoke execute",
    ]) expect(sql.toLowerCase()).toContain(fragment);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify missing-module/missing-file failures**

Run: `npm run test -- tests/agent-contracts.test.ts tests/multi-agent-schema.test.ts`

Expected: FAIL because `src/lib/agent/contracts.ts` and the migration do not exist.

- [ ] **Step 3: Add strict TypeScript/Zod contracts**

```ts
// src/lib/agent/contracts.ts
import { z } from "zod";
import { transportModeSchema } from "@/lib/validation/schemas";

export const POLICY_VERSION = "2026-07-15.v1" as const;
export const runStatusSchema = z.enum([
  "pending", "collecting", "cooling_down", "calculating", "validating",
  "awaiting_host_confirmation", "completed", "incomplete", "failed",
]);
export const routeTaskStatusSchema = z.enum([
  "pending", "running", "succeeded", "empty", "retryable_failure", "terminal_failure",
]);
export const routeTaskSchema = z.object({
  id: z.string(), runId: z.string(), participantId: z.string(), cityCode: z.string(),
  originCityCode: z.string(), mode: transportModeSchema, searchDate: z.string(),
  physicalKey: z.string(), status: routeTaskStatusSchema, attemptCount: z.number().int().nonnegative(),
  retryAfter: z.iso.datetime({ offset: true }).nullable(), errorCode: z.string().nullable(),
});
export const verifiedQuoteSchema = z.object({
  id: z.string(), quoteId: z.string().min(1), providerQuoteId: z.string().nullable(),
  participantId: z.string(), cityCode: z.string(), mode: transportModeSchema,
  searchDate: z.string(), queriedAt: z.iso.datetime({ offset: true }),
  priceCny: z.number().int().nonnegative(), departAt: z.iso.datetime({ offset: true }),
  arriveAt: z.iso.datetime({ offset: true }), durationMinutes: z.number().int().positive(),
  transferCount: z.number().int().nonnegative(), isDirect: z.boolean(), serviceName: z.string().min(1),
});
export const queryOutcomeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"), quotes: z.array(verifiedQuoteSchema).min(1) }),
  z.object({ status: z.literal("empty") }),
  z.object({ status: z.literal("retryable_failure"), code: z.string(), retryAfterMs: z.number().int().nonnegative() }),
  z.object({ status: z.literal("terminal_failure"), code: z.string() }),
]);
export const schemeProposalSchema = z.object({
  kind: z.enum(["saving", "fast"]),
  quoteIdsByParticipant: z.record(z.string(), z.string()),
  totalFareCny: z.number().int().nonnegative(),
});
export const calculationOutputSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("proposal"), cityCode: z.string().min(1),
    schemes: z.tuple([schemeProposalSchema, schemeProposalSchema]).superRefine((value, ctx) => {
      if (value[0].kind !== "saving" || value[1].kind !== "fast") ctx.addIssue({ code: "custom", message: "schemes must be saving then fast" });
    }),
    comparisonEvidence: z.object({ eligibleCityCodes: z.array(z.string()), orderedCityCodes: z.array(z.string()) }).strict(),
    explanationZh: z.string().regex(/\p{Script=Han}/u),
  }).strict(),
  z.object({ status: z.literal("incomplete"), missingTaskIds: z.array(z.string()).min(1) }).strict(),
]);
export type RunStatus = z.infer<typeof runStatusSchema>;
export type RouteTask = z.infer<typeof routeTaskSchema>;
export type QueryOutcome = z.infer<typeof queryOutcomeSchema>;
export type VerifiedQuote = z.infer<typeof verifiedQuoteSchema>;
export type RecommendationProposal = Extract<z.infer<typeof calculationOutputSchema>, { status: "proposal" }>;
export type ValidationDecision = { ok: true } | { ok: false; codes: string[] };
```

- [ ] **Step 4: Add the database structures and guarded server-only functions**

The migration must: move existing `participants.edit_token_hash` values into `participant_credentials` and then drop that public-table column; create `plan_credentials` for new host-token hashes; add `kind`, `requested_city_code`, `requested_by_participant_id`, `policy_version`, `trace_id`, `retry_after`, and the new status check to `recommendation_runs`; preserve old `city_recommendations`/`travel_options` as historical tables; create the new normalized tables from the responsibility map; add `unique (run_id, participant_id, quote_id)` and `unique (result_id, kind)`; add a partial unique index for one unsuperseded shared result per plan; and deny `anon`/`authenticated` access to credential, proposal, quote, and trace tables.

`publish_shared_result` must lock the run and proposal rows, reject non-automatic runs, require `validating`, require an approved proposal with the same version/policy, verify one result/two scheme rows/full participant routes/real verified quote references/date equality/totals, reject publication when an unsuperseded shared result already exists for the plan, and set the run to `completed` in the same transaction. `confirm_alternative_result` performs the same checks for `kind = 'alternative'`, validates the supplied hash against `plan_credentials`, supersedes the current result, marks the preview shared, and completes the run. Therefore only host-confirmed alternative runs may replace an existing shared result. Both functions are `security invoker`, use explicit relation names, revoke execute from `public`, `anon`, and `authenticated`, and grant execute only to `service_role`.

- [ ] **Step 5: Update `supabase/schema.sql`, run tests, and commit**

Run: `npm run test -- tests/agent-contracts.test.ts tests/multi-agent-schema.test.ts`

Expected: PASS.

```bash
git add src/lib/agent/contracts.ts src/types/domain.ts supabase/schema.sql supabase/migrations/202607150001_multi_agent_recommendation.sql tests/agent-contracts.test.ts tests/multi-agent-schema.test.ts
git commit -m "feat: add multi-agent recommendation contracts"
```

### Task 2: Migrate Plan Creation To Arrival Date And Issue Host Credentials

**Files:**
- Modify: `src/lib/validation/schemas.ts`
- Modify: `src/lib/ui/create-plan-form.ts`
- Modify: `src/app/api/plans/route.ts`
- Modify: `src/app/create/page.tsx`
- Modify: `src/lib/ui/meeting-history.ts`
- Modify: `src/components/plan/RecentMeetingRecords.tsx`
- Modify: `src/app/p/[code]/page.tsx`
- Modify: `src/app/p/[code]/join/page.tsx`
- Modify: `src/components/plan/PublicPlanContent.tsx`
- Modify: `src/lib/fallback/mvp-store.ts`
- Create: `supabase/migrations/202607150002_remove_target_arrival_time.sql`
- Test: `tests/create-plan-form.test.ts`
- Test: `tests/plan-route.test.ts`
- Test: `tests/create-plan-page.test.ts`
- Test: `tests/meeting-history.test.ts`
- Test: `tests/public-plan-content.test.ts`

**Interfaces:**
- Consumes: `generateToken()` and `hashToken()`.
- Produces: create body `{ title, arrivalDate, participantLimit }` and response `{ code, shareUrl, hostToken }`.
- Produces local history v2 `{ arrivalDate, hostToken? }`; old `{ meetingDate, targetArrivalTime }` entries parse into `{ arrivalDate: meetingDate }` and discard the time.

- [ ] **Step 1: Rewrite focused tests for the new request and compatibility parser**

```ts
const formData = new FormData();
formData.set("title", "上海周末见面");
formData.set("arrivalDate", "2026-08-15");
formData.set("participantLimit", "4");
expect(parseCreatePlanForm(formData)).toEqual({
  ok: true,
  data: { title: "上海周末见面", arrivalDate: "2026-08-15", participantLimit: 4 },
});
```

Add assertions that `targetArrivalTime`, `type="time"`, `ClockIcon`, and “目标到达时间” are absent; the native `type="date"` remains; the create response stores `hostToken`; and an old local-history row becomes an arrival-date-only row without losing participant tokens.

- [ ] **Step 2: Run focused tests and verify failures against the old contract**

Run: `npm run test -- tests/create-plan-form.test.ts tests/plan-route.test.ts tests/create-plan-page.test.ts tests/meeting-history.test.ts tests/public-plan-content.test.ts`

Expected: FAIL on the old `meetingDate/targetArrivalTime` shape.

- [ ] **Step 3: Implement the arrival-date request and credential write**

```ts
export const createPlanSchema = z.object({
  title: z.string().trim().min(1).max(60),
  arrivalDate: calendarDateSchema,
  participantLimit: z.number().int().min(2).max(6),
}).strict();
```

In `POST /api/plans`, create `hostToken`, insert `plans.meeting_date = arrivalDate`, insert only `hashToken(hostToken)` into `plan_credentials`, and return the raw token once. If the credential insert fails, delete the just-created plan before returning `CREATE_PLAN_FAILED`; never log the token or hash.

- [ ] **Step 4: Update form, summaries, join/public pages, and local history**

Use `arrivalDate` consistently in browser payloads and v2 local history. Show “计划到达日期” and summaries such as `2026-08-15 到达 · 4 人`. Keep the date input's full-row native hit area and remove the second grid column previously occupied by time.

- [ ] **Step 5: Drop the obsolete column after application compatibility is complete**

```sql
-- supabase/migrations/202607150002_remove_target_arrival_time.sql
alter table public.plans drop column if exists target_arrival_time;
```

Update `supabase/schema.sql` to represent a fresh install with `meeting_date` documented as arrival date and no target-time column.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm run test -- tests/create-plan-form.test.ts tests/plan-route.test.ts tests/create-plan-page.test.ts tests/meeting-history.test.ts tests/public-plan-content.test.ts`

Expected: PASS.

```bash
git add src supabase tests
git commit -m "feat: migrate plans to arrival date"
```

### Task 3: Upgrade The Gateway To Return Traceable Quote Evidence

**Files:**
- Modify: `services/travel-provider-gateway/src/contracts.ts`
- Modify: `services/travel-provider-gateway/src/flyai-adapter.ts`
- Modify: `services/travel-provider-gateway/src/service.ts`
- Modify: `services/travel-provider-gateway/src/server.ts`
- Modify: `services/travel-provider-gateway/tests/contracts.test.ts`
- Modify: `services/travel-provider-gateway/tests/flyai-adapter.test.ts`
- Modify: `services/travel-provider-gateway/tests/service.test.ts`
- Modify: `services/travel-provider-gateway/tests/server.test.ts`
- Modify: `src/lib/travel/types.ts`
- Modify: `src/lib/travel/gateway-client.ts`
- Modify: `tests/provider-shells.test.ts`

**Interfaces:**
- Produces request `{ originCityCode, originCityName, destinationCityCode, destinationCityName, departureDate, mode }`.
- Produces each option with gateway evidence `quoteId`, nullable upstream-native `providerQuoteId`, `provider`, normalized facts, and response-level `traceId`, `queriedAt`, `cache`.
- Produces stable error body `{ code, message, traceId, retryAfterMs }`; `retryAfterMs` is non-null only when cooldown/retry is allowed.

- [ ] **Step 1: Write failing gateway contract tests**

Assert `meetingDate` is rejected, `departureDate` is required, every successful option has a stable `quoteId`, identical normalized evidence yields the same ID, changed price/schedule yields a different ID, provider-native `itemId` is retained as `providerQuoteId`, and a 429 returns a bounded `retryAfterMs` without provider text.

- [ ] **Step 2: Run the gateway tests and verify contract failures**

Run: `cd services/travel-provider-gateway && npm run test -- tests/contracts.test.ts tests/flyai-adapter.test.ts tests/service.test.ts tests/server.test.ts`

Expected: FAIL on missing evidence fields and the old `meetingDate` request.

- [ ] **Step 3: Implement gateway-issued evidence identifiers**

Use `providerQuoteId = firstStringValue(item, ["itemId", "quoteId", "id"])`. Because the current FlyAI evidence does not guarantee an upstream-native quote identifier, define the publication `quoteId` at the gateway evidence boundary as `flyai:` plus a SHA-256 digest of canonical JSON containing provider-native ID when present, mode, origin/destination codes, service identity, departure/arrival offsets, price, transfer count, and query departure date. Preserve any native value separately as `providerQuoteId`. The gateway-issued ID is the stable identifier cited by agents and validators; it is evidence identity, not an inventory lock, and must never include names, booking URLs, or raw provider text.

```ts
function evidenceId(input: GatewaySearchRequest, option: EvidenceFields): string {
  const canonical = JSON.stringify([
    "flyai", option.providerQuoteId, input.mode, input.originCityCode,
    input.destinationCityCode, input.departureDate, option.serviceName,
    option.departAt, option.arriveAt, option.priceCny, option.transferCount,
  ]);
  return `flyai:${createHash("sha256").update(canonical).digest("hex")}`;
}
```

- [ ] **Step 4: Return trace/cooldown metadata without weakening serial execution**

Generate one UUID `traceId` at the HTTP boundary, retain cache/in-flight dedupe and `FifoLimiter(1)`, attach current remaining cooldown to rate-limit errors, and keep `execFile(executable, args, { shell: false, ... })`. Do not add a caller-controlled concurrency or provider override.

- [ ] **Step 5: Update the main-app gateway schema, run tests, and commit**

Run: `cd services/travel-provider-gateway && npm run lint && npm run test && npm run build`

Run: `npm run test -- tests/provider-shells.test.ts`

Expected: all PASS.

```bash
git add services/travel-provider-gateway src/lib/travel tests/provider-shells.test.ts
git commit -m "feat: add traceable gateway quote evidence"
```

### Task 4: Build The Route Matrix And China-Date Coverage Tools

**Files:**
- Create: `src/lib/recommendation/query-matrix.ts`
- Create: `src/lib/recommendation/date.ts`
- Rewrite: `src/lib/recommendation/travel-search.ts`
- Modify: `src/lib/travel/flyai-provider.ts`
- Test: `tests/query-matrix.test.ts`
- Rewrite: `tests/travel-search.test.ts`
- Modify: `tests/flyai-provider.test.ts`

**Interfaces:**
- Produces `buildRouteTasks({ participants, candidates, arrivalDate }): RouteTaskDraft[]`.
- Produces `arrivalDateInShanghai(timestamp): string | null` and `validateArrivalDate(quote, arrivalDate): ValidationDecision`.
- Produces `executeRouteTask(task): Promise<QueryOutcome>` where outcome is `success`, `empty`, `retryable_failure`, or `terminal_failure`; it never returns an estimate.

- [ ] **Step 1: Write failing date-expansion and overnight tests**

```ts
expect(searchDates("2026-08-15", "flight")).toEqual(["2026-08-14", "2026-08-15"]);
expect(searchDates("2026-08-15", "high_speed_rail")).toEqual(["2026-08-14", "2026-08-15"]);
expect(searchDates("2026-08-15", "normal_train")).toEqual(["2026-08-13", "2026-08-14", "2026-08-15"]);
expect(arrivalDateInShanghai("2026-08-14T17:30:00Z")).toBe("2026-08-15");
```

Cover a normal train departing two days earlier and arriving on the selected date, a quote arriving one minute into the next Shanghai date, duplicate participant origins sharing a physical lookup, unsupported mode output, retryable error metadata, and empty successful provider responses.

- [ ] **Step 2: Run focused tests and verify old same-day/target-time behavior fails**

Run: `npm run test -- tests/query-matrix.test.ts tests/travel-search.test.ts tests/flyai-provider.test.ts`

Expected: FAIL because the current collector requires target time, filters departure to the same day, and creates estimates.

- [ ] **Step 3: Implement deterministic task expansion**

Create one logical task per participant/candidate/mode/search date, sorted by the stable key `participantId:cityCode:mode:searchDate`. Add `physicalKey = originCityCode:cityCode:mode:searchDate` so the orchestrator can coalesce identical supplier lookups while persisting participant-level task outcomes.

- [ ] **Step 4: Rewrite travel execution to preserve failure states**

Map gateway facts to participants only after response validation; keep only matching mode and Shanghai arrival date; return `empty` if no feasible fact remains; return `retryable_failure` with `retryAfterMs` for gateway timeout/unavailable/rate-limited/upstream errors; return `terminal_failure` for invalid request/invalid response/CLI failure; do not import `estimate-provider.ts`.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -- tests/query-matrix.test.ts tests/travel-search.test.ts tests/flyai-provider.test.ts`

Expected: PASS.

```bash
git add src/lib/recommendation src/lib/travel tests
git commit -m "feat: expand arrival-date quote queries"
```

### Task 5: Add The Provider-Neutral Agent Model And Redacted Tracing

**Files:**
- Create: `src/lib/agent/model.ts`
- Create: `src/lib/agent/deepseek-model.ts`
- Create: `src/lib/agent/trace.ts`
- Modify: `.env.example`
- Test: `tests/agent-model.test.ts`
- Test: `tests/agent-trace.test.ts`

**Interfaces:**
- Produces `AgentModel.generate<T>({ agent, system, input, outputSchema, traceId }): Promise<T>`.
- Produces `createAgentModel(): AgentModel | null` and `recordAgentEvent(event): Promise<void>`.

- [ ] **Step 1: Write failing fake-model, schema-rejection, timeout, and redaction tests**

The tests must prove downstream agents depend only on `AgentModel`, unknown model fields fail Zod parsing, each call times out at 15 seconds with at most one SDK retry, and trace payloads remove keys matching `authorization`, `token`, `secret`, `bookingUrl`, `rawPayload`, participant `name`, and raw prompt text.

- [ ] **Step 2: Run focused tests and verify missing modules**

Run: `npm run test -- tests/agent-model.test.ts tests/agent-trace.test.ts`

Expected: FAIL because the model and trace boundaries do not exist.

- [ ] **Step 3: Implement the generic model boundary**

```ts
export interface AgentModel {
  readonly provider: string;
  readonly model: string;
  generate<T>(request: {
    agent: "manager" | "calculation" | "supervisor" | "fallback";
    system: string;
    input: unknown;
    outputSchema: z.ZodType<T>;
    traceId: string;
  }): Promise<T>;
}
```

The DeepSeek adapter uses the existing OpenAI-compatible client, JSON response format, server-only environment variables, strict Zod parsing, and returns typed errors `MODEL_UNAVAILABLE`, `MODEL_TIMEOUT`, or `MODEL_INVALID_OUTPUT`. Agent code must not import `openai`.

- [ ] **Step 4: Implement allowlisted trace payloads**

Persist run/trace ID, agent, event type, status, duration, model name, task/proposal IDs, validation codes, and counts. Never persist messages, raw quote provider payloads, participant names, booking URLs, authorization values, or environment values.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -- tests/agent-model.test.ts tests/agent-trace.test.ts`

Expected: PASS.

```bash
git add src/lib/agent .env.example tests/agent-model.test.ts tests/agent-trace.test.ts
git commit -m "feat: add provider-neutral agent model"
```

### Task 6: Implement Manager, Query, And Fallback Agents With Bounded Scheduling

**Files:**
- Create: `src/lib/agent/manager-agent.ts`
- Create: `src/lib/agent/query-agent.ts`
- Create: `src/lib/agent/fallback-agent.ts`
- Create: `src/lib/agent/query-pool.ts`
- Modify: `src/lib/recommendation/repository.ts`
- Test: `tests/manager-agent.test.ts`
- Test: `tests/query-agent.test.ts`
- Test: `tests/fallback-agent.test.ts`
- Test: `tests/query-pool.test.ts`

**Interfaces:**
- `ManagerAgent.prepare(input): Promise<{ runId, taskIds }>` validates 2–6 complete participants and persists the candidate/task matrix.
- `QueryAgent.execute(taskId): Promise<QueryOutcome>` invokes only the ticket tool and persists verified quotes/outcome.
- `FallbackAgent.decide(coverage): RecoveryAction` returns `wait_until`, `rerun_task`, `try_configured_adapter`, or `stop_incomplete`.
- `runQueryPool(taskIds, { logicalConcurrency }): Promise<void>` defaults to four logical workers while physical gateway calls remain serial.

- [ ] **Step 1: Write failing bounded-work tests**

Cover missing participant mode/city rejection, deterministic task IDs/order, four logical workers maximum, same physical key coalescing, gateway cooldown becoming `cooling_down`, retry count capped at two recovery attempts per task, rate-limit never immediately retried, absent secondary adapter never selected, and exhausted coverage becoming `incomplete`.

- [ ] **Step 2: Run focused tests and verify missing agents**

Run: `npm run test -- tests/manager-agent.test.ts tests/query-agent.test.ts tests/fallback-agent.test.ts tests/query-pool.test.ts`

Expected: FAIL because the agent modules do not exist.

- [ ] **Step 3: Implement code-controlled agent boundaries**

Manager uses deterministic form validation, candidate generation, and `buildRouteTasks`; a model may describe the next bounded stage but cannot add candidates/tasks. Query receives one stored task, calls the gateway without participant identity, validates evidence, then fans the same facts into participant-specific verified quote rows. Fallback receives only stored error/cooldown/attempt fields and returns one schema-validated allowed action.

- [ ] **Step 4: Implement the logical pool and persistence transitions**

Use an index-based worker pool with `Math.min(configured, pending.length)`, coalesce `physicalKey` promises, and persist every task transition before starting another stage. Configuration must clamp `AGENT_QUERY_CONCURRENCY` to `1..8`; it never changes gateway concurrency.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -- tests/manager-agent.test.ts tests/query-agent.test.ts tests/fallback-agent.test.ts tests/query-pool.test.ts`

Expected: PASS.

```bash
git add src/lib/agent src/lib/recommendation/repository.ts tests
git commit -m "feat: orchestrate bounded quote collection"
```

### Task 7: Implement Exact Saving, Fast, And Unique-City Policy Tools

**Files:**
- Replace: `src/lib/recommendation/scoring.ts` with `src/lib/recommendation/policy.ts`
- Create: `src/lib/recommendation/validators.ts`
- Replace: `tests/scoring.test.ts` with `tests/recommendation-policy.test.ts`
- Create: `tests/recommendation-validators.test.ts`

**Interfaces:**
- `directFirstEligible(quotes): VerifiedQuote[]`.
- `buildSavingScheme(participantIds, quotes): SchemeProposal | null`.
- `buildFastScheme(participantIds, quotes, savingTotal): SchemeProposal | null`.
- `rankEligibleCities(cityInputs): CityPolicyResult[]`.
- `validateRecommendationPolicy(input): ValidationDecision` and `sumFares(quoteIds, quoteMap): number`.

- [ ] **Step 1: Write the complete policy matrix as failing table tests**

Saving cases: direct beats cheaper/faster transfer; transfer becomes eligible only with no direct quote; the 110% boundary passes exactly and one cent-equivalent above fails; selection order is transfers, duration, fare, quote ID. Fast cases: the 130% boundary; minimum total duration; latest participant arrival; team transfers; total fare; ordered quote IDs. City cases: complete real coverage only; saving total; direct participant count descending; fare fairness gap; team duration; city code. Add rejection cases for estimates, missing participants, wrong date, altered totals, unknown quote IDs, duplicate/extra schemes, and extra cities.

- [ ] **Step 2: Run focused tests and verify old weighted scoring fails**

Run: `npm run test -- tests/recommendation-policy.test.ts tests/recommendation-validators.test.ts`

Expected: FAIL because current scoring uses hidden weighted penalties and estimated rows.

- [ ] **Step 3: Implement saving with integer arithmetic**

For each participant, select direct quotes if any otherwise transfer quotes. Find minimum fare, admit quotes satisfying `quote.priceCny * 10 <= minimum * 11`, sort by `[transferCount, durationMinutes, priceCny, quoteId]`, select one, and return null unless every participant has a quote.

- [ ] **Step 4: Implement exact fast dynamic programming**

Build participant states keyed by accumulated integer fare. For the same fare retain the lexicographically best tuple `[totalDuration, latestArrivalEpoch, totalTransfers, orderedQuoteIds]`; discard states above `savingTotal * 13 / 10`; after all participants choose the global best tuple `[totalDuration, latestArrivalEpoch, totalTransfers, totalFare, orderedQuoteIds]`. This avoids unbounded Cartesian products and remains exact for the specified objectives.

- [ ] **Step 5: Implement city ranking and independent replay validation**

Rank only cities where both deterministic schemes exist and all quotes are real/date-valid. Compute fairness as `max(participantFare) - min(participantFare)`. The validator recomputes schemes/ranking from stored quotes and compares every selected quote ID and total; it does not trust model evidence or proposal totals.

- [ ] **Step 6: Run tests and commit**

Run: `npm run test -- tests/recommendation-policy.test.ts tests/recommendation-validators.test.ts`

Expected: PASS.

```bash
git add src/lib/recommendation tests/recommendation-policy.test.ts tests/recommendation-validators.test.ts
git commit -m "feat: enforce exact recommendation policy"
```

### Task 8: Implement Calculation And Supervisor Proposal Review

**Files:**
- Create: `src/lib/agent/calculation-agent.ts`
- Create: `src/lib/agent/supervisor-agent.ts`
- Create: `src/lib/agent/prompts.ts`
- Test: `tests/calculation-agent.test.ts`
- Test: `tests/supervisor-agent.test.ts`
- Test: `tests/agent-prompts.test.ts`

**Interfaces:**
- `CalculationAgent.propose(snapshot): Promise<CalculationOutput>`.
- `SupervisorAgent.review(snapshot, proposal): Promise<{ decision: 'approve' } | { decision: 'correct'; codes: string[] }>`.
- Both consume identifiers and normalized evidence only; neither mutates quotes or publishes.

- [ ] **Step 1: Write failing strict-output and adversarial tests**

Use a fake `AgentModel` to return the valid proposal, hidden estimates, wrong dates, invented quote IDs, wrong totals, second city, missing scheme, reversed scheme order, hidden weight evidence, and unsupported Chinese facts. Assert Calculation calls arithmetic/evidence validators before save; Supervisor independently rejects every violation; correction is bounded to two proposal attempts; the same quote fixture/policy yields validator-equivalent facts despite different explanations.

- [ ] **Step 2: Run focused tests and verify missing agents**

Run: `npm run test -- tests/calculation-agent.test.ts tests/supervisor-agent.test.ts tests/agent-prompts.test.ts`

Expected: FAIL because Calculation/Supervisor do not exist.

- [ ] **Step 3: Implement minimal prompts with explicit authority limits**

The Calculation system prompt lists only supplied quote IDs, direct-first/110%/130%/city tie-break policy, required validator calls, and `incomplete` behavior. The Supervisor prompt receives coverage counts, proposal IDs, and deterministic validation decisions; it cannot approve when any deterministic decision is false. Chinese explanation is checked so every currency, service, city, time, and duration token appears in structured input.

- [ ] **Step 4: Implement versioned proposal/review loops**

Persist each attempt before review. On deterministic failure, save `rejected` plus codes and pass only those bounded codes to the next attempt. After two rejected attempts, set the run `failed` with public code `AGENT_PROPOSAL_INVALID`; never publish a deterministic substitute under the model's identity.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -- tests/calculation-agent.test.ts tests/supervisor-agent.test.ts tests/agent-prompts.test.ts`

Expected: PASS.

```bash
git add src/lib/agent tests/calculation-agent.test.ts tests/supervisor-agent.test.ts tests/agent-prompts.test.ts
git commit -m "feat: add calculation and supervisor agents"
```

### Task 9: Assemble The Run Orchestrator And Atomic Publication Guardrail

**Files:**
- Replace: `src/lib/recommendation/calculate-run.ts`
- Create: `src/lib/agent/run-orchestrator.ts`
- Complete: `src/lib/recommendation/repository.ts`
- Modify: `src/app/api/plans/[code]/calculate/route.ts`
- Create: `src/app/api/plans/[code]/runs/[runId]/advance/route.ts`
- Modify: `src/app/api/plans/[code]/route.ts`
- Test: `tests/run-orchestrator.test.ts`
- Rewrite: `tests/calculate-run.test.ts`
- Modify: `tests/calculate-route.test.ts`
- Modify: `tests/plan-read-route.test.ts`
- Modify: `tests/recommendation-run-schema.test.ts`

**Interfaces:**
- `startAutomaticRun({ code, participantToken }): Promise<{ runId, status }>` returns after creating work, not after a long supplier run.
- `advanceRun(runId): Promise<RunStatus>` performs one bounded idempotent transition or one query batch and then returns.
- Plan read returns public `latestRun` progress `{ status, traceId, pendingGroups, retryAt, diagnosticCode }` and `latestSharedResult` only from a completed run.

- [ ] **Step 1: Write failing state-machine and publication tests**

Cover every allowed transition, rejection of skipped stages, one active nonterminal run per plan, collecting progress, cooldown progress, targeted recovery, complete coverage before calculation, Supervisor plus deterministic guard required, RPC failure leaving no partial shared result, `completed` only after RPC, and incomplete coverage returning retry action/diagnostic run ID without cards.

- [ ] **Step 2: Run focused tests and verify the monolithic old calculation fails**

Run: `npm run test -- tests/run-orchestrator.test.ts tests/calculate-run.test.ts tests/calculate-route.test.ts tests/plan-read-route.test.ts tests/recommendation-run-schema.test.ts`

Expected: FAIL because the current route waits for the entire old scoring flow and publishes estimates.

- [ ] **Step 3: Implement the code-owned state machine**

Use a single transition map and compare-and-set repository updates. `pending -> collecting`; collection may alternate with `cooling_down`; complete coverage moves to `calculating`; saved proposal moves to `validating`; automatic approval calls `publish_shared_result`; exhausted recovery moves to `incomplete`; uncaught internal/model errors move to `failed`. A rejected proposal loops only `calculating/validating`, while missing coverage loops only affected tasks.

- [ ] **Step 4: Return quickly and advance through bounded idempotent requests**

Create the run synchronously and return HTTP 202 `{ runId, status: 'pending' }`. While a run is nonterminal, the authenticated client calls `POST /api/plans/[code]/runs/[runId]/advance` with its participant token; each call compare-and-sets the expected run version, performs at most one state transition or `AGENT_QUERY_CONCURRENCY` task batch, and returns the new public progress. Concurrent advance calls return the already-current state instead of duplicating work. This is the chosen deployment-neutral execution path; no post-response callback or long-lived serverless request is required.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -- tests/run-orchestrator.test.ts tests/calculate-run.test.ts tests/calculate-route.test.ts tests/plan-read-route.test.ts tests/recommendation-run-schema.test.ts`

Expected: PASS.

```bash
git add src/lib/agent/run-orchestrator.ts src/lib/recommendation src/app/api/plans tests
git commit -m "feat: publish guarded multi-agent results"
```

### Task 10: Bring Local Fallback Persistence To Contract Parity

**Files:**
- Rewrite: `src/lib/fallback/mvp-store.ts`
- Modify: `tests/fallback-mvp-flow.test.ts`
- Modify: `tests/fallback-calculation-lock.test.ts`
- Create: `tests/fallback-publication-guard.test.ts`

**Interfaces:**
- Implements the same repository operations and run/result shapes as Supabase, using process memory only.
- Never converts gateway failures into estimates or a completed result.

- [ ] **Step 1: Write failing fallback parity tests**

Test arrival-date plan creation with host token, the full run-state sequence with injected real quote fixtures, missing coverage ending `incomplete`, no shared result before `completed`, invalid proposal rejection, a private preview visible only with the requesting participant token, and host-token confirmation replacing the shared result.

- [ ] **Step 2: Run fallback tests and verify old estimated result behavior fails**

Run: `npm run test -- tests/fallback-mvp-flow.test.ts tests/fallback-calculation-lock.test.ts tests/fallback-publication-guard.test.ts`

Expected: FAIL because the old store calculates estimated three-city rows directly.

- [ ] **Step 3: Replace old recommendation arrays with repository-compatible records**

Store credentials separately, route tasks, verified quotes, proposal versions, results, two schemes, route references, and trace events. Reuse the production policy/validators instead of copying them. Guard publication inside one synchronous function that validates first and mutates shared state only after all checks pass.

- [ ] **Step 4: Run tests and commit**

Run: `npm run test -- tests/fallback-mvp-flow.test.ts tests/fallback-calculation-lock.test.ts tests/fallback-publication-guard.test.ts`

Expected: PASS.

```bash
git add src/lib/fallback/mvp-store.ts tests/fallback-mvp-flow.test.ts tests/fallback-calculation-lock.test.ts tests/fallback-publication-guard.test.ts
git commit -m "feat: align fallback store with publication policy"
```

### Task 11: Replace The Shared Result UI With One City And Two Schemes

**Files:**
- Rewrite: `src/app/p/[code]/result/page.tsx`
- Replace: `src/components/result/RecommendationCard.tsx` with `src/components/result/SharedRecommendation.tsx`
- Create: `src/components/result/SchemeCard.tsx`
- Rewrite: `src/components/result/RefreshingResultNotice.tsx`
- Modify: `src/components/plan/PublicPlanContent.tsx`
- Modify: `src/lib/ui/api-error-message.ts`
- Rewrite: `tests/result-page.test.ts`
- Replace: `tests/task-10-components.test.ts` with `tests/shared-recommendation.test.ts`
- Modify: `tests/public-plan-content.test.ts`

**Interfaces:**
- Shared result view consumes one result with `saving` and `fast`, each carrying selected participant routes and evidence freshness.
- Progress view consumes run states and never renders scheme cards unless `completed`.

- [ ] **Step 1: Write failing rendering tests for every public state**

Assert pending/collecting/cooling/calculating/validating show Chinese progress and remaining groups/retry time; incomplete shows “未生成推荐” plus retry and diagnostic ID; failed shows action guidance; awaiting-host-confirmation does not expose a private preview on the shared route; completed renders one city, exactly “省钱方案” and “省时方案”, team total fare/duration/transfers, every participant route, quote freshness, and no average fare/three-city labels/estimate copy.

- [ ] **Step 2: Run UI tests and verify the old card flow fails**

Run: `npm run test -- tests/result-page.test.ts tests/shared-recommendation.test.ts tests/public-plan-content.test.ts`

Expected: FAIL because the current page slices three recommendations and shows estimate/fairness cards.

- [ ] **Step 3: Implement progressive run feedback**

Public plan and result pages poll the public read endpoint with bounded backoff while nonterminal. Copy examples: `正在查询 8 组真实票价`, `供应商限流，12 秒后自动重试`, `正在核验全员路线`, and `真实票价覆盖不完整，尚未生成推荐。可重试，诊断编号 RUN-…`.

- [ ] **Step 4: Implement one-city/two-scheme presentation**

Render the recommended city once. Each `SchemeCard` maps persisted scheme-route rows directly—never reselects client-side—and shows participant, departure city/station, transport/service, time range, duration, transfer count, fare, provider label, `quoteId` short fingerprint, and China-time `queriedAt`. Do not render booking URLs.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test -- tests/result-page.test.ts tests/shared-recommendation.test.ts tests/public-plan-content.test.ts`

Expected: PASS.

```bash
git add src/app/p src/components/result src/components/plan/PublicPlanContent.tsx src/lib/ui/api-error-message.ts tests
git commit -m "feat: show one city with two schemes"
```

### Task 12: Add Private Alternative-City Preview And Host Confirmation

**Files:**
- Create: `src/app/api/plans/[code]/previews/route.ts`
- Create: `src/app/api/plans/[code]/previews/[runId]/route.ts`
- Create: `src/app/api/plans/[code]/previews/[runId]/confirm/route.ts`
- Create: `src/app/p/[code]/alternatives/page.tsx`
- Create: `src/components/result/AlternativeCityFlow.tsx`
- Create: `src/lib/security/host-confirmation.ts`
- Modify: `src/lib/security/participant-calculation.ts`
- Modify: `src/components/plan/PublicPlanContent.tsx`
- Test: `tests/alternative-preview-route.test.ts`
- Test: `tests/host-confirmation-route.test.ts`
- Test: `tests/alternative-city-flow.test.ts`
- Test: `tests/host-confirmation.test.ts`

**Interfaces:**
- Participant-authenticated POST body `{ cityCode, cityName }` returns `{ runId, status }`.
- Participant-authenticated preview GET returns only when token belongs to the requesting participant; host token may also read it.
- Host-authenticated confirmation POST returns `{ runId, status: 'completed' }` after atomic RPC.

- [x] **Step 1: Write failing authorization/privacy tests**

Cover any participant creating a supported-city preview, city search validation, preview matrix restricted to one requested city, another participant receiving 404 for the private payload, public shared route still showing the prior result, participant token unable to confirm, wrong/missing host token rejected, correct host token confirming the exact approved proposal version, and double confirmation being idempotent.

- [x] **Step 2: Run focused tests and verify missing endpoints**

Run: `npm run test -- tests/alternative-preview-route.test.ts tests/host-confirmation-route.test.ts tests/alternative-city-flow.test.ts tests/host-confirmation.test.ts`

Expected: FAIL because no preview/host-confirmation flow exists.

- [x] **Step 3: Implement preview creation and private reads**

Reuse city search normalization, Manager task expansion, collection, Calculation, Supervisor, and validators with `kind = 'alternative'` and exactly one candidate. On approval store result/schemes/routes as `private_preview` and set `awaiting_host_confirmation`; do not call shared publication.

- [x] **Step 4: Implement host verification and atomic replacement**

Read `hostToken` only from `x-host-token`, hash it, compare through the server repository, then call `confirm_alternative_result`. Never accept local-history role, participant token, query parameter, or request body role as authority.

- [x] **Step 5: Implement the mobile-first flow**

Add “换个城市看看” after a completed shared result, reuse `CityCombobox`, show private progress/preview on `/alternatives`, label it “仅你可见的预览”, and show “请发起人确认替换” unless this browser holds the host token; host sees “确认替换共享结果”.

- [ ] **Step 6: Run tests and commit**

Run: `npm run test -- tests/alternative-preview-route.test.ts tests/host-confirmation-route.test.ts tests/alternative-city-flow.test.ts tests/host-confirmation.test.ts`

Expected: PASS.

```bash
git add src/app/api/plans src/app/p src/components/result src/lib/security tests
git commit -m "feat: add host-confirmed city previews"
```

### Task 13: Remove The Old Recommendation And Estimate Publication Paths

**Files:**
- Delete: `src/lib/travel/estimate-provider.ts`
- Delete: `src/lib/travel/unavailable-option.ts`
- Delete: `src/lib/ai/recommendation-explainer.ts`
- Delete: `src/app/api/plans/[code]/explain/route.ts`
- Delete: `tests/scoring.test.ts`
- Delete: `tests/explain-route.test.ts`
- Delete: `tests/task-10-components.test.ts`
- Modify: `src/types/domain.ts`
- Modify: `src/lib/ui/api-error-message.ts`
- Test: `tests/no-legacy-recommendation-path.test.ts`

**Interfaces:**
- No production import may reference old weighted scoring, estimate fallback, three labels, target arrival time, or explanation-only endpoint.

- [ ] **Step 1: Add a failing static guard test**

Scan `src/` excluding `src/lib/legacy/` and assert there are no matches for `targetArrivalTime`, `target_arrival_time`, `estimateTravelOption`, `scoreCheapest`, `scoreBalanced`, `scoreFastest`, `PARTIAL_ESTIMATE_FALLBACK`, `cheapest`, `balanced`, `fastest`, or `/explain`.

- [ ] **Step 2: Run the guard and inventory remaining callers**

Run: `npm run test -- tests/no-legacy-recommendation-path.test.ts`

Expected: FAIL and list every remaining legacy reference.

- [ ] **Step 3: Delete obsolete modules and migrate every caller/test**

Retain `TravelSource` only if historical result readers still type old database rows; keep that type in a `legacy` namespace and never pass it into new policy functions. New `VerifiedQuote` has no source discriminator because the table admits only validated real evidence.

- [ ] **Step 4: Run the full root test suite and commit**

Run: `npm run test`

Expected: PASS with no legacy-path matches.

```bash
git add -A src tests
git commit -m "refactor: remove estimated recommendation flow"
```

### Task 14: Update Operational Documentation And Complete Automated And Live Acceptance

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/integration-guide.md`
- Modify: `.env.example`
- Modify: `services/travel-provider-gateway/.env.example`
- Create: `docs/acceptance/2026-07-15-multi-agent-live-acceptance.md`

**Interfaces:**
- Documents the implemented behavior, API payloads, states, environment, retry semantics, evidence definition, historical-data policy, and release evidence.

- [ ] **Step 1: Update docs only after implementation tests pass**

Document `arrivalDate`, one city/two schemes, preview/confirmation endpoints, `AgentModel`, run states, gateway `departureDate/quoteId/traceId/retryAfterMs`, credential locations, and the rule that `/healthz` proves only reachability. State that pre-migration `city_recommendations` and `travel_options` are historical read-only records and cannot become new published results; pre-migration plans without a host credential may view history but must create a new plan to use host confirmation.

- [ ] **Step 2: Run root and gateway quality gates**

Run: `npm run lint && npm run test && npm run build`

Expected: all PASS.

Run: `cd services/travel-provider-gateway && npm run lint && npm run test && npm run build`

Expected: all PASS.

- [ ] **Step 3: Run a fixed supplier coverage plan after cooldown**

Use operator-managed keys without printing them. Create a fresh 2–6 participant plan covering flight, high-speed rail, normal train, previous-day searches, and an overnight arrival. Record only run ID, route fingerprints, modes, task outcomes, quote counts, error codes, cooldown timestamps, and coverage totals. `/healthz` and one successful quote do not satisfy this step; every selected participant route in both schemes must trace to stored verified evidence.

- [ ] **Step 4: Perform real-device H5 acceptance**

On a phone, verify the native date picker, create/share/join flow, live progress, one completed city, two scheme cards, participant details, incomplete recovery, private alternative preview, and host confirmation. Repeat at approximately `390x844` and desktop `1440x1000`; desktop remains a centered phone-sized canvas.

- [ ] **Step 5: Record evidence and commit documentation**

Fill `docs/acceptance/2026-07-15-multi-agent-live-acceptance.md` with timestamp, build commit, device/browser, run IDs, pass/fail for each acceptance criterion, redacted supplier coverage summary, and any blocking stable error code. Do not paste secrets, raw provider output, participant names, authorization headers, or booking URLs.

```bash
git add README.md docs/architecture.md docs/integration-guide.md docs/acceptance/2026-07-15-multi-agent-live-acceptance.md .env.example services/travel-provider-gateway/.env.example
git commit -m "docs: record multi-agent acceptance"
```

## Review Gates And Execution Order

1. Task 1 uses the approved decisions: automatic publication cannot replace an existing shared result, and `quoteId` is the gateway-issued stable evidence identifier while an upstream-native ID is preserved separately when present.
2. Complete Tasks 2–4 before agent work so every later agent consumes the final arrival-date/evidence contract.
3. Complete Tasks 5–8 before orchestration; agent behavior is reviewed independently from state transitions and publication.
4. Complete Tasks 9–10 before UI; shared and fallback persistence must enforce the same invariants.
5. Complete Tasks 11–12 before deleting legacy paths so visual comparison and rollback remain possible during review.
6. Complete Task 13 only after the new end-to-end automated flow passes.
7. Task 14 is the release gate; supplier coverage or real-device failure blocks claiming the architecture complete.

## Plan Self-Review Checklist

- Every approved specification section maps to at least one task: input/date expansion (2, 4), real evidence/gateway (3), agents/tools/concurrency/recovery (5–9), exact policy/publication (7–10), one-city UI (11), alternative flow (12), legacy removal/history (1, 13, 14), security/observability (1, 3, 5, 12), and automated/live acceptance (14).
- Type names are consistent across tasks: `RunStatus`, `VerifiedQuote`, `RecommendationProposal`, `SchemeProposal`, `ValidationDecision`, `AgentModel`, and `QueryOutcome`.
- Publication authority is never delegated to a model: Supervisor approval and deterministic validation precede a server-only atomic RPC.
- No task permits estimates, partial participant coverage, hidden weights, average-fare UI, unbounded supplier calls, or host-role inference from browser state.
