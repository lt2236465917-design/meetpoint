# 票价网关限流保护 Implementation Plan

**执行状态（2026-07-14）：** 任务 1–5 的代码、测试、文档和质量门禁均已完成；本文件中的原始步骤清单保留为实施记录。尚未完成的只有真实移动设备日期/时间验收，以及在供应商冷却后用新计划确认真实票价覆盖。当前截图所示估算行属于后续供应商可靠性排障，不应被误写成“限流保护未实施”。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 FlyAI 请求串行、合并相同在途请求并分级冷却，同时保证每个计划至多一个运行中的推荐计算。

**Architecture:** 网关按既有缓存键维护在途 Promise：同 key 的缓存未命中共享一次受限供应商调用。限流不即时重试，而是在单并发队列任务开始前执行全局冷却。主应用保留已批准的运行中查询，并用数据库部分唯一索引原子兜底，fallback 在内存状态执行相同检查。

**Tech Stack:** TypeScript、Node.js HTTP、Next.js 16、Supabase/PostgreSQL、Zod 4、Vitest 4。

## Global Constraints

- 用户可见文案使用中文；代码、文件和 commit message 使用英文。
- 网关只负责 FlyAI 凭据、CLI、校验、超时、重试、缓存、限流和稳定错误；不得生成候选城市、选路、评分、调用 DeepSeek 或持久化参与者身份。
- 默认网关并发必须为 `1`，只缓存成功的规范化响应；同 key 在途成功和失败均须清理。
- `PROVIDER_RATE_LIMITED` 不即时重试：首次冷却 5 秒，冷却后的下一次供应商调用仍限流则冷却 15 秒。超时、不可用、上游不可用仍最多重试一次。
- 同一计划已有 `running` run 时，认证后的计算 API 返回 `409 CALCULATION_IN_PROGRESS`，不新建 run、不调票价提供方。
- 只在 `completed` 展示结果；进行中统一文案为“正在查询票价并生成结果，请稍后自动刷新。”。
- `/healthz` 仅证明网关进程可达，不能证明供应商额度、风控状态或真实票价可用。
- 完成前跑根项目和网关各自的 `lint`、`test`、`build`；不自动 push。

## File Map

- Modify `services/travel-provider-gateway/src/limiter.ts`: 默认 FIFO 单并发。
- Modify `services/travel-provider-gateway/src/service.ts`: in-flight 合并、冷却、限流不重试。
- Modify `services/travel-provider-gateway/tests/limiter.test.ts` and `tests/service.test.ts`: 网关回归。
- Modify `supabase/schema.sql`; create `supabase/migrations/202607140001_add_running_recommendation_run_guard.sql`: 每计划仅一个 running run。
- Modify `src/lib/recommendation/calculate-run.ts` and `src/lib/fallback/mvp-store.ts`: 两种存储的运行互斥。
- Modify `src/app/api/plans/[code]/calculate/route.ts` and `src/lib/ui/api-error-message.ts`: 409 与中文提示。
- Modify `tests/calculate-run.test.ts`, `tests/calculate-route.test.ts`; create `tests/fallback-calculation-lock.test.ts`, `tests/recommendation-run-schema.test.ts`: 主应用回归。
- Modify `README.md`, `docs/architecture.md`, `docs/integration-guide.md`: 运行与排障说明。

---

### Task 1: Default the limiter to serial FIFO execution

**Files:**
- Modify: `services/travel-provider-gateway/tests/limiter.test.ts`
- Modify: `services/travel-provider-gateway/src/limiter.ts`

**Interfaces:**
- Consumes: `new FifoLimiter(concurrency?: number)`.
- Produces: default one active job; explicit positive concurrency is unchanged.

- [ ] **Step 1: Write the failing test**

Replace the existing default test with:

```ts
it("runs one default job at a time and starts queued jobs in FIFO order", async () => {
  const limiter = new FifoLimiter();
  const started: number[] = [];
  const releases: Array<() => void> = [];
  let active = 0;
  let maximumActive = 0;
  const jobs = Array.from({ length: 3 }, (_, index) => limiter.run(async () => {
    started.push(index);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise<void>((resolve) => { releases[index] = resolve; });
    active -= 1;
    return index;
  }));

  await Promise.resolve();
  expect(started).toEqual([0]);
  expect(maximumActive).toBe(1);
  releases[0]!();
  await vi.waitFor(() => expect(started).toEqual([0, 1]));
  releases[1]!();
  await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
  releases[2]!();
  await expect(Promise.all(jobs)).resolves.toEqual([0, 1, 2]);
  expect(maximumActive).toBe(1);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm run test -- tests/limiter.test.ts`

Expected: FAIL because four operations begin by default.

- [ ] **Step 3: Implement the minimum change**

In `services/travel-provider-gateway/src/limiter.ts` replace:

```ts
constructor(private readonly concurrency = 4) {
```

with:

```ts
constructor(private readonly concurrency = 1) {
```

- [ ] **Step 4: Verify GREEN**

Run: `npm run test -- tests/limiter.test.ts`

Expected: all limiter tests pass.

- [ ] **Step 5: Commit**

```bash
git add services/travel-provider-gateway/src/limiter.ts services/travel-provider-gateway/tests/limiter.test.ts
git commit -m "fix: serialize gateway provider calls"
```

### Task 2: Coalesce cache misses and cool down rate-limited provider calls

**Files:**
- Modify: `services/travel-provider-gateway/tests/service.test.ts`
- Modify: `services/travel-provider-gateway/src/service.ts`

**Interfaces:**
- Consumes: `createTravelSearchService({ searchProvider?, cache?, limiter?, now?, sleep? })`.
- Produces: `search(input)` shares same-key in-flight work, clones responses for callers, clears failures, and waits before queued provider calls during cooldown.

- [ ] **Step 1: Write failing in-flight tests**

Append:

```ts
it("shares one provider call for concurrent cache misses with the same key", async () => {
  let resolveProvider: ((value: typeof option[]) => void) | undefined;
  const searchProvider = vi.fn(() => new Promise<typeof option[]>((resolve) => {
    resolveProvider = resolve;
  }));
  const service = createTravelSearchService({ searchProvider });

  const first = service.search(request);
  const second = service.search({ ...request, originCityName: "北京市" });
  await vi.waitFor(() => expect(searchProvider).toHaveBeenCalledTimes(1));
  resolveProvider?.([option]);

  const [firstResponse, secondResponse] = await Promise.all([first, second]);
  expect(firstResponse).toEqual(secondResponse);
  expect(firstResponse).not.toBe(secondResponse);
});

it("removes a failed in-flight entry so a later same-key request can call the provider", async () => {
  const searchProvider = vi.fn()
    .mockRejectedValueOnce(new FlyAIAdapterError("PROVIDER_NO_ROUTE", "detail"))
    .mockResolvedValueOnce([option]);
  const service = createTravelSearchService({ searchProvider });

  await expect(service.search(request)).rejects.toMatchObject({ code: "PROVIDER_NO_ROUTE" });
  await expect(service.search(request)).resolves.toMatchObject({ options: [option] });
  expect(searchProvider).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm run test -- tests/service.test.ts`

Expected: same-key concurrent test fails because current code starts two provider calls.

- [ ] **Step 3: Write failing cooldown tests**

Remove `PROVIDER_RATE_LIMITED` from the existing retry parameter list. Add `afterEach(() => vi.useRealTimers())`, then add:

```ts
it("does not immediately retry rate limiting and waits five seconds before the next provider call", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-12T08:00:00Z"));
  const searchProvider = vi.fn()
    .mockRejectedValueOnce(new FlyAIAdapterError("PROVIDER_RATE_LIMITED", "detail"))
    .mockResolvedValueOnce([option]);
  const service = createTravelSearchService({ searchProvider });

  await expect(service.search(request)).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
  expect(searchProvider).toHaveBeenCalledTimes(1);
  const next = service.search({ ...request, destinationCityCode: "wuhan", destinationCityName: "武汉" });
  await vi.advanceTimersByTimeAsync(4_999);
  expect(searchProvider).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await expect(next).resolves.toMatchObject({ options: [option] });
  expect(searchProvider).toHaveBeenCalledTimes(2);
});

it("waits fifteen seconds after the first post-cooldown provider call is rate limited", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-12T08:00:00Z"));
  const searchProvider = vi.fn()
    .mockRejectedValueOnce(new FlyAIAdapterError("PROVIDER_RATE_LIMITED", "first"))
    .mockRejectedValueOnce(new FlyAIAdapterError("PROVIDER_RATE_LIMITED", "second"))
    .mockResolvedValueOnce([option]);
  const service = createTravelSearchService({ searchProvider });

  await expect(service.search(request)).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
  const second = service.search({ ...request, destinationCityCode: "wuhan", destinationCityName: "武汉" });
  await vi.advanceTimersByTimeAsync(5_000);
  await expect(second).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
  const third = service.search({ ...request, destinationCityCode: "nanjing", destinationCityName: "南京" });
  await vi.advanceTimersByTimeAsync(14_999);
  expect(searchProvider).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  await expect(third).resolves.toMatchObject({ options: [option] });
  expect(searchProvider).toHaveBeenCalledTimes(3);
});
```

- [ ] **Step 4: Verify RED**

Run: `npm run test -- tests/service.test.ts`

Expected: rate-limit tests fail because current code retries immediately and does not wait.

- [ ] **Step 5: Implement the service state and provider wrapper**

In `ServiceDependencies` add `sleep?: (milliseconds: number) => Promise<void>`; in the factory add:

```ts
const sleep = dependencies.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, milliseconds);
}));
const inFlight = new Map<string, Promise<GatewaySearchResponse>>();
let cooldownUntil = 0;
let nextCooldownMs = 5_000;
```

Remove `PROVIDER_RATE_LIMITED` from `shouldRetryProviderError`. Extract a `waitForCooldown` helper which calculates `cooldownUntil - now().getTime()` and awaits `sleep(remaining)` only when positive. It must execute inside `limiter.run` immediately before the provider attempt.

Extract `fetchAndNormalize(request, key, queriedAt)`, retaining the existing schema validation, stable error mapping, cache write and response shape. Inside its limited provider call:

```ts
await waitForCooldown();
try {
  const value = await searchProvider(request);
  nextCooldownMs = 5_000;
  return value;
} catch (error) {
  if (error instanceof FlyAIAdapterError && error.code === "PROVIDER_RATE_LIMITED") {
    cooldownUntil = now().getTime() + nextCooldownMs;
    nextCooldownMs = 15_000;
  }
  if (error instanceof FlyAIAdapterError && shouldRetryProviderError(error.code)) {
    return searchProvider(request);
  }
  throw error;
}
```

After cache lookup, use this exact ownership shape and return a clone to each caller:

```ts
const existing = inFlight.get(key);
const pending = existing ?? fetchAndNormalize(parsedRequest.data, key, timestamp);
if (!existing) {
  inFlight.set(key, pending);
  void pending.finally(() => inFlight.delete(key)).catch(() => undefined);
}
return structuredClone(await pending);
```

- [ ] **Step 6: Verify GREEN**

Run: `npm run test -- tests/service.test.ts && npm run test`

Expected: gateway suite passes; same-key misses invoke once; failed work clears; rate limiting has no immediate retry and gates calls at 5,000 then 15,000 ms.

- [ ] **Step 7: Commit**

```bash
git add services/travel-provider-gateway/src/service.ts services/travel-provider-gateway/tests/service.test.ts
git commit -m "fix: protect gateway from rate limited bursts"
```

### Task 3: Make the Supabase running-run guard atomic

**Files:**
- Create: `tests/recommendation-run-schema.test.ts`
- Modify: `supabase/schema.sql`
- Create: `supabase/migrations/202607140001_add_running_recommendation_run_guard.sql`
- Modify: `tests/calculate-run.test.ts`
- Modify: `src/lib/recommendation/calculate-run.ts`

**Interfaces:**
- Produces: at most one `recommendation_runs.status = 'running'` per plan; `calculatePlanRecommendations` throws `CALCULATION_IN_PROGRESS` before provider search for an existing or concurrent run.

- [ ] **Step 1: Write the failing schema test**

Create `tests/recommendation-run-schema.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const guard = "create unique index if not exists recommendation_runs_one_running_per_plan";
const predicate = "where status = 'running'";

describe("running recommendation run database guard", () => {
  it("declares the partial unique index in schema and migration", async () => {
    const [schema, migration] = await Promise.all([
      readFile("supabase/schema.sql", "utf8"),
      readFile("supabase/migrations/202607140001_add_running_recommendation_run_guard.sql", "utf8"),
    ]);
    for (const sql of [schema.toLowerCase(), migration.toLowerCase()]) {
      expect(sql).toContain(guard);
      expect(sql).toContain("on recommendation_runs (plan_id)");
      expect(sql).toContain(predicate);
    }
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm run test -- tests/recommendation-run-schema.test.ts`

Expected: FAIL because no migration or guard exists.

- [ ] **Step 3: Add the database guard**

Add this immediately after `recommendation_runs` in `supabase/schema.sql`, and create the migration containing exactly this statement:

```sql
create unique index if not exists recommendation_runs_one_running_per_plan
  on recommendation_runs (plan_id)
  where status = 'running';
```

- [ ] **Step 4: Verify GREEN**

Run: `npm run test -- tests/recommendation-run-schema.test.ts`

Expected: schema contract passes.

- [ ] **Step 5: Write failing calculation tests**

Add `selectRunningRun(data)` to `tests/calculate-run.test.ts`, returning a chain `select().eq("plan_id", ...).eq("status", ...).maybeSingle()`. Add it as the second `mocks.from` return for every existing calculation fixture. Add these exact assertions:

```ts
it("rejects an existing running plan before creating a run or searching fares", async () => {
  const planLookup = selectEqSingle({ id: "plan-1", meeting_date: "2026-08-01", target_arrival_time: "12:00" });
  const runningRunLookup = selectRunningRun({ id: "run-active" });
  mocks.from
    .mockReturnValueOnce({ select: planLookup.select })
    .mockReturnValueOnce({ select: runningRunLookup.select });

  const { calculatePlanRecommendations } = await import("@/lib/recommendation/calculate-run");
  await expect(calculatePlanRecommendations({ code: "ABC123" })).rejects.toThrow("CALCULATION_IN_PROGRESS");
  expect(mocks.search).not.toHaveBeenCalled();
  expect(mocks.from).toHaveBeenCalledTimes(2);
});

it("maps the running-run unique conflict without searching fares", async () => {
  // Use the existing success plan/participants/candidates fixtures, with selectRunningRun(null).
  // Make the run insert's single() resolve { data: null, error: { code: "23505" } }.
  await expect(calculatePlanRecommendations({ code: "ABC123" })).rejects.toThrow("CALCULATION_IN_PROGRESS");
  expect(mocks.search).not.toHaveBeenCalled();
});
```

The second test must use the full ordered mock sequence: plan, running lookup, participants, candidates, run insert. Do not use a database or real provider.

- [ ] **Step 6: Verify RED**

Run: `npm run test -- tests/calculate-run.test.ts`

Expected: existing-run test fails because calculation does not read runs; unique-conflict test fails because it returns `RUN_CREATE_FAILED`.

- [ ] **Step 7: Implement pre-check and unique-conflict mapping**

Immediately after plan lookup in `src/lib/recommendation/calculate-run.ts`, before participant/candidate queries, add:

```ts
const { data: runningRun } = await supabase
  .from("recommendation_runs")
  .select("id")
  .eq("plan_id", plan.id)
  .eq("status", "running")
  .maybeSingle<{ id: string }>();

if (runningRun) throw new Error("CALCULATION_IN_PROGRESS");
```

Replace run creation with:

```ts
const { data: run, error: runError } = await supabase
  .from("recommendation_runs")
  .insert({ plan_id: plan.id, status: "running" })
  .select("id")
  .single<{ id: string }>();

if (runError && typeof runError === "object" && "code" in runError && runError.code === "23505") {
  throw new Error("CALCULATION_IN_PROGRESS");
}
if (!run) throw new Error("RUN_CREATE_FAILED");
```

- [ ] **Step 8: Verify GREEN**

Run: `npm run test -- tests/calculate-run.test.ts tests/recommendation-run-schema.test.ts`

Expected: normal calculation, pre-existing run, and simulated database race all pass; neither conflict calls the provider.

- [ ] **Step 9: Commit**

```bash
git add supabase/schema.sql supabase/migrations/202607140001_add_running_recommendation_run_guard.sql src/lib/recommendation/calculate-run.ts tests/calculate-run.test.ts tests/recommendation-run-schema.test.ts
git commit -m "fix: prevent concurrent recommendation runs"
```

### Task 4: Mirror the guard in fallback and return the approved API conflict

**Files:**
- Create: `tests/fallback-calculation-lock.test.ts`
- Modify: `src/lib/fallback/mvp-store.ts`
- Modify: `tests/calculate-route.test.ts`
- Modify: `src/app/api/plans/[code]/calculate/route.ts`
- Modify: `src/lib/ui/api-error-message.ts`

**Interfaces:**
- Produces: fallback throws `CALCULATION_IN_PROGRESS` before adding another run; authenticated API returns 409 and the client maps the stable code to the approved copy.

- [ ] **Step 1: Write a failing fallback lock test**

Create `tests/fallback-calculation-lock.test.ts`. Mock `@/lib/recommendation/travel-search` with a deferred `collectTravelOptions`; build a two-person plan using real `createFallbackPlan` / `createFallbackParticipant`. Assert:

```ts
const first = calculateFallbackRecommendations(created.code);
await vi.waitFor(() => expect(collectTravelOptions).toHaveBeenCalledTimes(1));

await expect(calculateFallbackRecommendations(created.code)).rejects.toThrow("CALCULATION_IN_PROGRESS");
expect(readFallbackPlan(created.code)?.latestRun?.status).toBe("running");

releaseTravelSearch({ options: [], usedFallback: true });
await expect(first).resolves.toMatchObject({ runId: expect.any(String) });
```

Do not mock `calculateFallbackRecommendations`; it must inspect real fallback state.

- [ ] **Step 2: Verify RED**

Run: `npm run test -- tests/fallback-calculation-lock.test.ts`

Expected: second call creates a second run instead of rejecting.

- [ ] **Step 3: Implement fallback check**

In `calculateFallbackRecommendations`, after participant validation and before candidate generation, add:

```ts
const runningRun = store.runs.find(
  (run) => run.plan_id === plan.id && run.status === "running",
);
if (runningRun) throw new Error("CALCULATION_IN_PROGRESS");
```

- [ ] **Step 4: Verify GREEN**

Run: `npm run test -- tests/fallback-calculation-lock.test.ts`

Expected: exactly one run stays running until the deferred provider resolves.

- [ ] **Step 5: Write the failing route contract**

Add to `tests/calculate-route.test.ts`:

```ts
it("returns an in-progress conflict after a participant is authorized", async () => {
  mocks.verifyParticipantCanCalculatePlan.mockResolvedValue({ ok: true, planId: "plan-1", participantId: "participant-1" });
  mocks.calculatePlanRecommendations.mockRejectedValue(new Error("CALCULATION_IN_PROGRESS"));

  const { POST } = await import("@/app/api/plans/[code]/calculate/route");
  const response = await POST(new Request("http://localhost/api/plans/ABC123/calculate", {
    method: "POST", headers: { "x-participant-token": "edit-token" },
  }), { params: Promise.resolve({ code: "ABC123" }) });

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toEqual({ error: "CALCULATION_IN_PROGRESS" });
});
```

- [ ] **Step 6: Verify RED**

Run: `npm run test -- tests/calculate-route.test.ts`

Expected: FAIL because every calculation exception maps to HTTP 400.

- [ ] **Step 7: Implement HTTP and user-copy mapping**

In the calculate route catch branch:

```ts
const code = error instanceof Error ? error.message : "CALCULATION_FAILED";
return NextResponse.json(
  { error: code },
  { status: code === "CALCULATION_IN_PROGRESS" ? 409 : 400 },
);
```

Add to `src/lib/ui/api-error-message.ts`:

```ts
CALCULATION_IN_PROGRESS: "正在查询票价并生成结果，请稍后自动刷新。",
```

Do not change `PublicPlanContent`: when polling sees `running` it already shows this exact copy, and its failed POST path already calls `getApiErrorMessage`.

- [ ] **Step 8: Verify GREEN**

Run: `npm run test -- tests/calculate-route.test.ts tests/fallback-calculation-lock.test.ts && npm run test`

Expected: 409 is returned only after authorization; fallback does not create a second run; root regression suite passes.

- [ ] **Step 9: Commit**

```bash
git add src/lib/fallback/mvp-store.ts src/app/api/plans/[code]/calculate/route.ts src/lib/ui/api-error-message.ts tests/fallback-calculation-lock.test.ts tests/calculate-route.test.ts
git commit -m "fix: report active recommendation calculations"
```

### Task 5: Update runbook and fully verify

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/integration-guide.md`

**Interfaces:**
- Produces: current operational documentation without stale four-concurrency guidance or health-check overclaim.

- [ ] **Step 1: Update architecture facts**

In `docs/architecture.md` external-provider items 4 and 6, replace four-concurrency claims with: default FIFO one; same-key in-flight merging; `PROVIDER_RATE_LIMITED` has no immediate retry and applies global 5→15 second cooling; other transient codes retain one retry; duplicate same-plan calculation returns `409 CALCULATION_IN_PROGRESS`. Keep deterministic second pass, estimates, and provider boundaries unchanged.

- [ ] **Step 2: Update integration guide**

In `docs/integration-guide.md`:

1. Add `CALCULATION_IN_PROGRESS` to the API error table: `A calculation for this plan is already running; clients should wait for polling refresh.`
2. Replace historical “four concurrent” production behavior with serial execution, coalescing and cooling.
3. Add beneath the health bullet: `A successful health response proves only that the gateway process is reachable; it does not prove FlyAI quota, risk-control clearance, or real-ticket availability.`
4. State that a post-cooldown live check uses a new plan; real rows remain `飞猪参考价`, estimate rows retain their stable reason, and one health response or one success is not supplier-wide authorization.

- [ ] **Step 3: Scan stale claims**

Run: `rg -n "four concurrent|并发.*四|FIFO concurrency limited to four|matching the gateway limiter" README.md docs AGENTS.md`

Expected: no stale current-behavior claim remains; dated historical evidence is allowed only when explicitly historical.

- [ ] **Step 4: Run complete verification**

Run from root:

```bash
npm run lint
npm run test
npm run build
cd services/travel-provider-gateway
npm run lint
npm run test
npm run build
```

Expected: all six commands exit 0. Read the actual output before reporting any success.

- [ ] **Step 5: Review diff and requirement coverage**

Run:

```bash
git diff --check
git diff -- docs/architecture.md docs/integration-guide.md supabase services/travel-provider-gateway/src services/travel-provider-gateway/tests src/lib/recommendation src/lib/fallback src/app/api/plans/[code]/calculate src/lib/ui tests
git status --short
```

Check every approved behavior: single concurrency; same-key sharing; successful-only cache; 5→15 cooling; no rate-limit retry; non-rate transient retry; Supabase/fallback lock; 409; Chinese progress copy; and health limitation.

- [ ] **Step 6: Commit documentation**

```bash
git add docs/architecture.md docs/integration-guide.md
git commit -m "docs: document gateway rate limit protection"
```

## Manual Acceptance After Automated Verification

1. Wait for any supplier cooldown; do not use `GET /healthz` as upstream clearance.
2. With a newly created, full plan, calculate once. Confirm real rows say `飞猪参考价`; non-real rows say `估算` and show their stable reason.
3. During the calculation, repeat from another browser/device or HTTP client. Confirm `409 CALCULATION_IN_PROGRESS`, no second run, and the Chinese progress copy.
4. On physical iOS and Android hardware, tap date and arrival-time regions on the create page. Confirm native picker opening, value persistence, and the native 2–6 person selector. Record device/browser/version. This cannot be claimed from automated checks.

## Plan Self-Review

- **Spec coverage:** Tasks 1–2 implement serial execution, coalescing, failed-entry removal, rate cooldown and retry boundary. Tasks 3–4 cover Supabase/fallback mutual exclusion, 409 and UX. Task 5 covers operations, full verification, supplier smoke and physical-device acceptance.
- **Race safety:** The approved pre-check remains; the partial unique index plus PostgreSQL `23505` mapping prevents two simultaneous checks from both inserting.
- **Scope:** A crash after creating a `running` row has no approved stale-run recovery policy, so this plan intentionally does not invent one.
- **Placeholder scan:** no unfinished markers remain; all behavior has a focused test and command.
