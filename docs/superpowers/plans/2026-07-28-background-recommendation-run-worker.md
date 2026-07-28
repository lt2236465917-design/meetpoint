# Background Recommendation Run Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Tasks 1–7 complete on `codex/repository-audit-complete` @ `f53acbd` (2026-07-28 Subagent-Driven). ECS leave-and-finish checklist #11 **PASS** (2026-07-28, plan `ZNM4ZK` → `incomplete`); `202607280001` applied on linked Supabase; live `/opt/meetpoint` runs healthy `run-worker` (plus Node-20 `ws` transport hotfix).

**Goal:** On Alibaba Cloud ECS Compose, add a private `run-worker` that continuously advances nonterminal automatic and alternative recommendation runs through the existing lease-guarded `advanceRun` path so users can leave the page and still reach a terminal (or host-confirmation) state.

**Architecture:** Keep Next.js + travel-gateway unchanged in role. Add a third private Compose service that runs an in-process Node loop over the same app libraries (`SupabaseRecommendationRepository` + `RunOrchestrator.advanceRun`). Browser tabs remain optional accelerators via the existing authenticated advance route; host confirmation stays human-only. Overseas Vercel does not get a worker in this release.

**Tech Stack:** Node 20, TypeScript (`tsx` for the worker entry), existing Vitest unit tests, Docker Compose multi-stage root `Dockerfile` target `worker`, service-role Supabase, private Docker network.

**Design:** `docs/superpowers/specs/2026-07-28-background-recommendation-run-worker-design.md` (commit `34a9af8` on `codex/repository-audit-complete`).

## Global Constraints

- Reuse lease-guarded `advanceRun`; never invent a second query/publication pipeline.
- Advance only `kind ∈ {automatic, alternative}` and `status ∈ {pending, collecting, cooling_down, calculating, validating}`.
- Never auto-confirm alternatives; never call `confirm_alternative_result` from the worker.
- No public “advance all” HTTP API; no published host port for `run-worker`.
- Rolling inactivity deadline stays **2 hours** active / **7 days** awaiting host confirmation.
- China ECS acceptance requires “leave and finish”; Vercel leave-and-finish is explicitly out of scope for this release.
- User-facing copy: users **can leave**; `RUN_STALE_EXPIRED` may mention worker/system downtime, not “must keep the page open” as the primary path.
- Secrets only in runtime env; service-role + gateway token never in browser or image build args.
- Run `npm run lint`, `npm run test`, and `npm run build` before claiming completion; extend `tests/aliyun-deployment-config.test.ts` for the third service.

---

## Related Uncommitted Work (fold in first)

Branch `codex/repository-audit-complete` already has **uncommitted** foundation work that this worker depends on. **Do not discard it.** Fold it into Tasks 1–2, then build the worker on top.

| Area | Current working-tree state | How this plan treats it |
| --- | --- | --- |
| 2h stale window | `ACTIVE_RUN_STALE_MS = 2h`; `supabase/migrations/202607280001_extend_active_run_stale_window.sql` (untracked); `supabase/schema.sql` + docs/tests already say 2h | **Task 1:** verify, add any missing schema assertions, commit as the stale-window foundation. Apply the migration on linked Supabase before ECS acceptance. |
| Plan progress entry | `PublicPlanContent` links「看看安排进度」/「去重新查询」; plan GET exposes `latestRun.runId`; optional plan-page advance | **Task 2:** keep the links and optional advance; **replace** keep-page-open copy with leave-friendly copy. |
| Result / stale copy | `RefreshingResultNotice` still says「请保持本页打开…」and `RUN_STALE_EXPIRED` says keep page open after retry | **Task 2:** rewrite to match the approved design (leave OK; stale = worker/system interrupted too long). |
| Docs already mentioning 2h | `docs/architecture.md`, `docs/integration-guide.md` | Keep the 2h wording in Task 1; Task 6 adds the worker topology. |

Suggested commit split after Task 1 vs Task 2 (not one mega-commit):

1. `fix: extend active run stale window to 2 hours`
2. `fix: let users leave while recommendation runs continue`

Then worker tasks commit separately.

---

## File Map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/202607280001_extend_active_run_stale_window.sql` | Replace create/save SQL intervals `15 minutes` → `2 hours` (already drafted). |
| `supabase/schema.sql` | Canonical schema mirror of the 2h intervals (already drafted). |
| `src/lib/recommendation/run-deadlines.ts` | `ACTIVE_RUN_STALE_MS = 2h` (already drafted). |
| `src/lib/recommendation/run-worker.ts` | **Create.** Pure selection helpers + injectable poll tick/loop (unit-tested). |
| `src/lib/recommendation/repository.ts` | Add `listWorkerAdvanceableRuns()` on the orchestrator repository. |
| `src/worker/recommendation-run-worker.ts` | **Create.** Process entry: env, heartbeat file, signal handling, call the loop. |
| `Dockerfile` | Add `worker` target (deps + `src` + `tsx`; no Next.js start; `USER node`). |
| `deploy/aliyun/compose.yaml` | Add private `run-worker` service; no ports; depends on healthy gateway. |
| `deploy/aliyun/production.env.example` | Optional worker poll/concurrency knobs (empty placeholders). |
| `deploy/aliyun/README.md` | Document the third service and leave-and-finish acceptance note. |
| `package.json` | Add `tsx` dependency; add `"worker:recommendation": "tsx src/worker/recommendation-run-worker.ts"`. |
| `src/components/result/RefreshingResultNotice.tsx` | Leave-friendly progress + stale copy (revise uncommitted text). |
| `src/components/plan/PublicPlanContent.tsx` | Keep progress/retry links; revise “page must stay open” helper. |
| `src/app/api/plans/[code]/route.ts` | Keep `latestRun.runId` exposure (already drafted). |
| `tests/run-worker.test.ts` | **Create.** Selection + loop with mocked `advanceRun`. |
| `tests/aliyun-deployment-config.test.ts` | Assert third service, no ports, worker Dockerfile target. |
| `tests/*` (plan/result/deadlines) | Align copy and 2h assertions with Tasks 1–2. |
| `docs/architecture.md`, `docs/integration-guide.md`, `AGENTS.md`, `docs/superpowers/README.md` | Runtime + authority updates for worker + 2h + leave UX. |

Packaging choice (locked by this plan): **multi-stage root `Dockerfile` target `worker`** that installs deps, copies `src/` + `tsconfig.json`, and runs `tsx` — smaller than a second Nest-like package, and does not start Next.js.

---

### Task 1: Land The 2-Hour Active Stale Window

**Files:**
- Keep / verify: `src/lib/recommendation/run-deadlines.ts`
- Keep / verify: `supabase/migrations/202607280001_extend_active_run_stale_window.sql`
- Keep / verify: `supabase/schema.sql`
- Keep / verify: `docs/architecture.md`, `docs/integration-guide.md` (2h deadline sentences only)
- Test: `tests/run-deadlines.test.ts`
- Modify: `tests/recommendation-run-schema.test.ts` (assert live schema uses `2 hours`, not `15 minutes`, in create/save refresh paths)

**Interfaces:**
- Consumes: none new
- Produces: `ACTIVE_RUN_STALE_MS === 2 * 60 * 60 * 1000`; SQL create matrix / `save_route_task_outcome` refresh `now() + interval '2 hours'`

- [ ] **Step 1: Confirm working-tree foundation already matches the design**

Run:

```bash
rg -n "ACTIVE_RUN_STALE_MS|interval '2 hours'|interval '15 minutes'" \
  src/lib/recommendation/run-deadlines.ts \
  supabase/schema.sql \
  supabase/migrations/202607280001_extend_active_run_stale_window.sql \
  tests/run-deadlines.test.ts \
  docs/architecture.md \
  docs/integration-guide.md
```

Expected:
- TS constant is `2 * 60 * 60 * 1000`
- live `schema.sql` create/save paths use `interval '2 hours'`
- migration file exists and mirrors those function bodies
- historical `202607210001_*.sql` may still mention `15 minutes` (do **not** rewrite history)

- [ ] **Step 2: Write a failing schema assertion for the live 2-hour window**

Append to `tests/recommendation-run-schema.test.ts`:

```ts
it("refreshes active-run stale_after with a 2-hour window in the live schema", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");
  const createMatrix = extractLastFunction(schema, "create_recommendation_run_matrix");
  const saveOutcome = extractLastFunction(schema, "save_route_task_outcome");

  expect(createMatrix).toContain("now() + interval '2 hours'");
  expect(createMatrix).not.toContain("now() + interval '15 minutes'");
  expect(saveOutcome).toContain("set stale_after = now() + interval '2 hours'");
  expect(saveOutcome).not.toContain("set stale_after = now() + interval '15 minutes'");
});
```

- [ ] **Step 3: Run the new assertion**

Run: `npx vitest run tests/recommendation-run-schema.test.ts tests/run-deadlines.test.ts -v`

Expected: PASS once schema already has 2h (current working tree). If FAIL because schema still says 15 minutes, apply the drafted migration body into `schema.sql` before continuing.

- [ ] **Step 4: Commit the stale-window foundation only**

```bash
git add \
  src/lib/recommendation/run-deadlines.ts \
  supabase/migrations/202607280001_extend_active_run_stale_window.sql \
  supabase/schema.sql \
  docs/architecture.md \
  docs/integration-guide.md \
  tests/run-deadlines.test.ts \
  tests/recommendation-run-schema.test.ts
git commit -m "$(cat <<'EOF'
fix: extend active run stale window to 2 hours

Give healthy background advancement enough inactivity budget before RUN_STALE_EXPIRED.
EOF
)"
```

Do **not** include plan/result UI files in this commit.

---

### Task 2: Leave-Friendly Progress Copy And Plan Progress Entry

**Files:**
- Modify: `src/components/result/RefreshingResultNotice.tsx`
- Modify: `src/components/plan/PublicPlanContent.tsx`
- Modify: `src/app/api/plans/[code]/route.ts` (keep `runId` if not already committed)
- Modify: `AGENTS.md` (one permanent rule bullet about background advancement + optional client advance)
- Test: `tests/result-page.test.ts`, `tests/public-plan-content.test.ts`, `tests/plan-read-route.test.ts`

**Interfaces:**
- Consumes: Task 1 deadlines; existing `advanceAutomaticRun` / `nextRefreshDelayMs`
- Produces: user-facing copy that states leaving is OK; optional client advance retained

- [ ] **Step 1: Write failing copy assertions**

In `tests/result-page.test.ts`, replace the stale-expiry expectation that requires「请保持本页打开」with:

```ts
it("explains stale expiry as system interruption, not a keep-page-open duty", () => {
  const html = renderStatus("failed", {
    diagnosticCode: "RUN_STALE_EXPIRED",
  });

  expect(html).toContain("查询暂停太久中断了");
  expect(html).toContain("后台服务");
  expect(html).not.toContain("请保持本页打开");
  expect(html).toContain("重新查询");
  expect(html).not.toContain("开算");
});
```

Add a nonterminal helper assertion (same file or adjacent):

```ts
it("tells waiting users they can leave while querying continues", () => {
  const html = renderStatus("collecting");
  expect(html).toContain("可以离开");
  expect(html).not.toContain("请保持本页打开");
  expect(html).not.toContain("关掉页面会暂停");
});
```

In `tests/public-plan-content.test.ts`, for the in-progress case that currently may assert keep-open wording, assert:

```ts
expect(html).toContain("看看安排进度");
expect(html).toContain("可以离开");
expect(html).not.toContain("有人打开进度页时才会继续查票");
expect(html).not.toContain("关掉页面会暂停");
```

Keep assertions for「去重新查询」and `runId` / `advanceAutomaticRun` source checks.

- [ ] **Step 2: Run tests to verify they fail on the uncommitted keep-open copy**

Run: `npx vitest run tests/result-page.test.ts tests/public-plan-content.test.ts tests/plan-read-route.test.ts -v`

Expected: FAIL on keep-open / “关掉页面会暂停” strings still present in components.

- [ ] **Step 3: Implement leave-friendly copy (and keep progress entry + optional advance)**

In `RefreshingResultNotice.tsx`, replace the autoRefresh helper paragraph with:

```tsx
{autoRefresh ? (
  <p className="text-xs leading-5 text-[var(--atmosphere-muted)]">
    可以离开，系统会继续查票；回来打开本页即可查看进度。
  </p>
) : null}
```

Replace the `RUN_STALE_EXPIRED` message with:

```ts
if (progress.diagnosticCode === "RUN_STALE_EXPIRED") {
  return "查询暂停太久中断了。多半是后台服务停太久，点「重新查询」后再等一会儿。";
}
```

In `PublicPlanContent.tsx`, keep the「看看安排进度」/「去重新查询」links and optional `advanceAutomaticRun` polling. Replace the in-progress helper with:

```tsx
<p className="text-xs leading-5 text-[var(--atmosphere-muted)]">
  可以离开，系统会继续安排；点上面可随时回来看进度。
</p>
```

Ensure plan GET continues to project `runId: latestRun.id` so plan-page optional advance works.

Add to `AGENTS.md` Development section (near the automatic result-page bullet):

```md
- On Alibaba Cloud ECS Compose, a private `run-worker` advances nonterminal automatic and alternative runs without an open browser tab. Client advance remains an optional accelerator when a participant tab is open. Host confirmation of alternatives stays human-only. Progress UI must say users can leave; `RUN_STALE_EXPIRED` copy may mention backend interruption, not “must keep the page open” as the primary instruction. Overseas Vercel is not required to ship an equivalent worker in the current release.
```

- [ ] **Step 4: Re-run focused UI/API tests**

Run: `npx vitest run tests/result-page.test.ts tests/public-plan-content.test.ts tests/plan-read-route.test.ts -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  AGENTS.md \
  src/app/api/plans/\[code\]/route.ts \
  src/components/plan/PublicPlanContent.tsx \
  src/components/result/RefreshingResultNotice.tsx \
  tests/plan-read-route.test.ts \
  tests/public-plan-content.test.ts \
  tests/result-page.test.ts
git commit -m "$(cat <<'EOF'
fix: let users leave while recommendation runs continue

Keep plan/result progress entry and optional client advance, but stop instructing users to keep the page open.
EOF
)"
```

---

### Task 3: Worker Run Selection Helpers And Repository Listing

**Files:**
- Create: `src/lib/recommendation/run-worker.ts`
- Modify: `src/lib/recommendation/repository.ts`
- Create: `tests/run-worker.test.ts`

**Interfaces:**
- Consumes: Supabase service-role client patterns from `SupabaseRecommendationRepository`
- Produces:
  - `WORKER_ADVANCEABLE_KINDS = ["automatic", "alternative"] as const`
  - `WORKER_ADVANCEABLE_STATUSES = ["pending", "collecting", "cooling_down", "calculating", "validating"] as const`
  - `export type WorkerAdvanceableRun = { id: string; planId: string; status: typeof WORKER_ADVANCEABLE_STATUSES[number]; kind: typeof WORKER_ADVANCEABLE_KINDS[number]; startedAt: string }`
  - `export function isWorkerAdvanceableStatus(status: string): boolean`
  - `export function selectNextWorkerRun(runs: readonly WorkerAdvanceableRun[]): WorkerAdvanceableRun | null` — oldest `startedAt` first; stable by `id` on ties
  - `RunOrchestratorRepository.listWorkerAdvanceableRuns(): Promise<WorkerAdvanceableRun[]>`

- [ ] **Step 1: Write failing selection tests**

Create `tests/run-worker.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  selectNextWorkerRun,
  isWorkerAdvanceableStatus,
  runWorkerTick,
  type WorkerAdvanceableRun,
} from "@/lib/recommendation/run-worker";

function run(
  overrides: Partial<WorkerAdvanceableRun> & Pick<WorkerAdvanceableRun, "id" | "startedAt">,
): WorkerAdvanceableRun {
  return {
    planId: "plan-1",
    status: "collecting",
    kind: "automatic",
    ...overrides,
  };
}

describe("recommendation run worker selection", () => {
  it("accepts only worker-advanceable statuses", () => {
    expect(isWorkerAdvanceableStatus("pending")).toBe(true);
    expect(isWorkerAdvanceableStatus("cooling_down")).toBe(true);
    expect(isWorkerAdvanceableStatus("awaiting_host_confirmation")).toBe(false);
    expect(isWorkerAdvanceableStatus("completed")).toBe(false);
    expect(isWorkerAdvanceableStatus("failed")).toBe(false);
  });

  it("selects the oldest started_at run and breaks ties by id", () => {
    const selected = selectNextWorkerRun([
      run({ id: "b", startedAt: "2026-07-28T01:00:00.000Z", kind: "alternative" }),
      run({ id: "a", startedAt: "2026-07-28T01:00:00.000Z" }),
      run({ id: "c", startedAt: "2026-07-28T02:00:00.000Z" }),
    ]);
    expect(selected?.id).toBe("a");
  });

  it("returns null when there is nothing to advance", () => {
    expect(selectNextWorkerRun([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run selection tests to verify failure**

Run: `npx vitest run tests/run-worker.test.ts -v`

Expected: FAIL with module / export not found.

- [ ] **Step 3: Implement selection helpers**

Create `src/lib/recommendation/run-worker.ts`:

```ts
export const WORKER_ADVANCEABLE_KINDS = ["automatic", "alternative"] as const;
export const WORKER_ADVANCEABLE_STATUSES = [
  "pending",
  "collecting",
  "cooling_down",
  "calculating",
  "validating",
] as const;

export type WorkerAdvanceableKind = (typeof WORKER_ADVANCEABLE_KINDS)[number];
export type WorkerAdvanceableStatus = (typeof WORKER_ADVANCEABLE_STATUSES)[number];

export type WorkerAdvanceableRun = {
  id: string;
  planId: string;
  status: WorkerAdvanceableStatus;
  kind: WorkerAdvanceableKind;
  startedAt: string;
};

export function isWorkerAdvanceableStatus(
  status: string,
): status is WorkerAdvanceableStatus {
  return (WORKER_ADVANCEABLE_STATUSES as readonly string[]).includes(status);
}

export function selectNextWorkerRun(
  runs: readonly WorkerAdvanceableRun[],
): WorkerAdvanceableRun | null {
  if (runs.length === 0) return null;
  return [...runs].sort((left, right) => {
    const byStarted = left.startedAt.localeCompare(right.startedAt);
    if (byStarted !== 0) return byStarted;
    return left.id.localeCompare(right.id);
  })[0] ?? null;
}
```

- [ ] **Step 4: Add repository listing**

Extend `RunOrchestratorRepository` with:

```ts
listWorkerAdvanceableRuns(): Promise<WorkerAdvanceableRun[]>;
```

Implement on `SupabaseRecommendationRepository`:

```ts
async listWorkerAdvanceableRuns(): Promise<WorkerAdvanceableRun[]> {
  const { data, error } = await createServiceSupabaseClient()
    .from("recommendation_runs")
    .select("id,plan_id,status,kind,started_at")
    .in("kind", [...WORKER_ADVANCEABLE_KINDS])
    .in("status", [...WORKER_ADVANCEABLE_STATUSES])
    .order("started_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`Failed to list worker advanceable runs: ${error.message}`);
  return (data ?? []).flatMap((row) => {
    if (
      typeof row.id !== "string" ||
      typeof row.plan_id !== "string" ||
      typeof row.started_at !== "string" ||
      (row.kind !== "automatic" && row.kind !== "alternative") ||
      !isWorkerAdvanceableStatus(row.status)
    ) {
      return [];
    }
    return [{
      id: row.id,
      planId: row.plan_id,
      status: row.status,
      kind: row.kind,
      startedAt: row.started_at,
    }];
  });
}
```

Import the worker types/helpers at the top of `repository.ts`. Do **not** list `awaiting_host_confirmation`.

- [ ] **Step 5: Re-run selection tests**

Run: `npx vitest run tests/run-worker.test.ts -v`

Expected: selection cases PASS (tick tests from Task 4 may still be absent / skipped until added).

- [ ] **Step 6: Commit**

```bash
git add \
  src/lib/recommendation/run-worker.ts \
  src/lib/recommendation/repository.ts \
  tests/run-worker.test.ts
git commit -m "$(cat <<'EOF'
feat: select oldest advanceable recommendation runs for the worker

List only automatic/alternative runs in pending through validating for fair background advancement.
EOF
)"
```

---

### Task 4: Worker Tick Loop With Mocked `advanceRun`

**Files:**
- Modify: `src/lib/recommendation/run-worker.ts`
- Modify: `tests/run-worker.test.ts`

**Interfaces:**
- Consumes: `selectNextWorkerRun`, `listWorkerAdvanceableRuns`
- Produces:
  - `export type AdvanceRunFn = (input: { runId: string; planId: string }) => Promise<unknown>`
  - `export type RunWorkerDeps = { listRuns: () => Promise<WorkerAdvanceableRun[]>; advanceRun: AdvanceRunFn; now?: () => Date; logError?: (message: string, context: Record<string, unknown>) => void }`
  - `export async function runWorkerTick(deps: RunWorkerDeps): Promise<WorkerAdvanceableRun | null>`
  - `export type RunWorkerLoopOptions = RunWorkerDeps & { pollIntervalMs: number; maxInFlight?: number; signal?: AbortSignal; onHeartbeat?: () => void | Promise<void>; sleep?: (ms: number) => Promise<void> }`
  - `export async function runWorkerLoop(options: RunWorkerLoopOptions): Promise<void>` — immediate first tick, then sleep; default `maxInFlight = 1`

- [ ] **Step 1: Extend failing tick/loop tests**

Append to `tests/run-worker.test.ts`:

```ts
describe("recommendation run worker tick", () => {
  it("advances the oldest run and still calls advance during cooling_down", async () => {
    const advanceRun = vi.fn(async () => ({ status: "cooling_down" }));
    const selected = await runWorkerTick({
      listRuns: async () => [
        run({ id: "cool", status: "cooling_down", startedAt: "2026-07-28T00:00:00.000Z" }),
        run({ id: "later", startedAt: "2026-07-28T01:00:00.000Z" }),
      ],
      advanceRun,
    });
    expect(selected?.id).toBe("cool");
    expect(advanceRun).toHaveBeenCalledWith({ runId: "cool", planId: "plan-1" });
  });

  it("returns null without advancing when idle", async () => {
    const advanceRun = vi.fn();
    await expect(runWorkerTick({
      listRuns: async () => [],
      advanceRun,
    })).resolves.toBeNull();
    expect(advanceRun).not.toHaveBeenCalled();
  });

  it("logs and swallows unexpected advance failures so the loop can continue", async () => {
    const logError = vi.fn();
    const advanceRun = vi.fn(async () => {
      throw new Error("RUN_ADVANCE_FAILED");
    });
    await expect(runWorkerTick({
      listRuns: async () => [run({ id: "boom", startedAt: "2026-07-28T00:00:00.000Z" })],
      advanceRun,
      logError,
    })).resolves.toEqual(expect.objectContaining({ id: "boom" }));
    expect(logError).toHaveBeenCalledWith(
      "[recommendation-run-worker] advance failed",
      expect.objectContaining({ runId: "boom", planId: "plan-1" }),
    );
  });

  it("runs an immediate tick before the first sleep and stops on abort", async () => {
    const advanceRun = vi.fn(async () => ({ status: "collecting" }));
    const sleeps: number[] = [];
    const heartbeats: number[] = [];
    const controller = new AbortController();
    let ticks = 0;

    await runWorkerLoop({
      pollIntervalMs: 3_000,
      listRuns: async () => {
        ticks += 1;
        if (ticks >= 2) controller.abort();
        return [run({ id: `run-${ticks}`, startedAt: "2026-07-28T00:00:00.000Z" })];
      },
      advanceRun,
      signal: controller.signal,
      onHeartbeat: async () => {
        heartbeats.push(ticks);
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(advanceRun).toHaveBeenCalled();
    expect(heartbeats[0]).toBe(1);
    expect(sleeps[0]).toBe(3_000);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/run-worker.test.ts -v`

Expected: FAIL because `runWorkerTick` / `runWorkerLoop` are undefined.

- [ ] **Step 3: Implement tick + loop**

Append to `src/lib/recommendation/run-worker.ts`:

```ts
export type AdvanceRunFn = (input: {
  runId: string;
  planId: string;
}) => Promise<unknown>;

export type RunWorkerDeps = {
  listRuns: () => Promise<WorkerAdvanceableRun[]>;
  advanceRun: AdvanceRunFn;
  logError?: (message: string, context: Record<string, unknown>) => void;
};

export async function runWorkerTick(
  deps: RunWorkerDeps,
): Promise<WorkerAdvanceableRun | null> {
  const selected = selectNextWorkerRun(await deps.listRuns());
  if (!selected) return null;
  try {
    await deps.advanceRun({ runId: selected.id, planId: selected.planId });
  } catch (error) {
    (deps.logError ?? console.error)("[recommendation-run-worker] advance failed", {
      runId: selected.id,
      planId: selected.planId,
      status: selected.status,
      kind: selected.kind,
      error,
    });
  }
  return selected;
}

export type RunWorkerLoopOptions = RunWorkerDeps & {
  pollIntervalMs: number;
  maxInFlight?: number;
  signal?: AbortSignal;
  onHeartbeat?: () => void | Promise<void>;
  sleep?: (ms: number) => Promise<void>;
};

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runWorkerLoop(options: RunWorkerLoopOptions): Promise<void> {
  const maxInFlight = options.maxInFlight ?? 1;
  if (maxInFlight !== 1) {
    throw new Error("RUN_WORKER_MAX_IN_FLIGHT must be 1 in v1");
  }
  const sleep = options.sleep ?? defaultSleep;

  while (!options.signal?.aborted) {
    await options.onHeartbeat?.();
    await runWorkerTick(options);
    if (options.signal?.aborted) break;
    await sleep(options.pollIntervalMs);
  }
}
```

Notes for implementers:
- Cap stays **1** in v1 (design allows ≤2; do not implement 2 until a follow-up explicitly asks).
- `cooling_down` is advanced; orchestrator no-ops until `retry_after`.
- Lease collisions with an open browser tab are handled inside `advanceRun` (return current status). Do not add a second lock.

- [ ] **Step 4: Re-run worker tests**

Run: `npx vitest run tests/run-worker.test.ts -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/recommendation/run-worker.ts tests/run-worker.test.ts
git commit -m "$(cat <<'EOF'
feat: add recommendation run worker tick loop

Poll oldest advanceable runs with one in-flight advance and keep cooling_down on the orchestrator clock.
EOF
)"
```

---

### Task 5: Process Entry, Heartbeat, And Env Wiring

**Files:**
- Create: `src/worker/recommendation-run-worker.ts`
- Modify: `package.json` (add `tsx` dependency + `worker:recommendation` script)
- Test: extend `tests/run-worker.test.ts` with env parsing unit tests **or** add `tests/run-worker-env.test.ts` for pure helpers exported from the entry module’s sibling

Prefer exporting env helpers from `src/lib/recommendation/run-worker.ts` to keep the entry thin:

```ts
export function workerPollIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.RUN_WORKER_POLL_INTERVAL_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : 3_000;
  if (!Number.isFinite(parsed) || parsed < 500 || parsed > 60_000) {
    throw new Error("RUN_WORKER_POLL_INTERVAL_MS must be between 500 and 60000");
  }
  return parsed;
}

export function workerHeartbeatPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.RUN_WORKER_HEARTBEAT_PATH?.trim() || "/tmp/run-worker-heartbeat";
}
```

**Interfaces:**
- Consumes: `runWorkerLoop`, `SupabaseRecommendationRepository.listWorkerAdvanceableRuns`, `advanceRun` from `@/lib/agent/run-orchestrator`
- Produces: long-running process that writes heartbeat mtime and exits on SIGTERM/SIGINT after abort

- [ ] **Step 1: Write failing env helper tests**

```ts
import { workerPollIntervalMs, workerHeartbeatPath } from "@/lib/recommendation/run-worker";

it("defaults poll interval to 3s and rejects out-of-range values", () => {
  expect(workerPollIntervalMs({})).toBe(3_000);
  expect(workerPollIntervalMs({ RUN_WORKER_POLL_INTERVAL_MS: "5000" })).toBe(5_000);
  expect(() => workerPollIntervalMs({ RUN_WORKER_POLL_INTERVAL_MS: "100" })).toThrow(
    /RUN_WORKER_POLL_INTERVAL_MS/,
  );
});

it("defaults the heartbeat path", () => {
  expect(workerHeartbeatPath({})).toBe("/tmp/run-worker-heartbeat");
  expect(workerHeartbeatPath({ RUN_WORKER_HEARTBEAT_PATH: "/tmp/x" })).toBe("/tmp/x");
});
```

- [ ] **Step 2: Run to verify failure, then implement helpers + entry**

Create `src/worker/recommendation-run-worker.ts`:

```ts
import { writeFile } from "node:fs/promises";

import { advanceRun } from "@/lib/agent/run-orchestrator";
import { SupabaseRecommendationRepository } from "@/lib/recommendation/repository";
import {
  runWorkerLoop,
  workerHeartbeatPath,
  workerPollIntervalMs,
} from "@/lib/recommendation/run-worker";
import { hasSupabaseEnvironment } from "@/lib/supabase/server";

async function main(): Promise<void> {
  if (!hasSupabaseEnvironment()) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!process.env.TRAVEL_GATEWAY_URL || !process.env.TRAVEL_GATEWAY_TOKEN) {
    throw new Error("Missing TRAVEL_GATEWAY_URL or TRAVEL_GATEWAY_TOKEN");
  }

  const repository = new SupabaseRecommendationRepository();
  const heartbeatPath = workerHeartbeatPath();
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  console.info("[recommendation-run-worker] starting", {
    pollIntervalMs: workerPollIntervalMs(),
    heartbeatPath,
  });

  await runWorkerLoop({
    pollIntervalMs: workerPollIntervalMs(),
    signal: controller.signal,
    listRuns: () => repository.listWorkerAdvanceableRuns(),
    advanceRun: (input) => advanceRun(input),
    onHeartbeat: async () => {
      await writeFile(heartbeatPath, `${Date.now()}\n`, "utf8");
    },
  });
}

main().catch((error) => {
  console.error("[recommendation-run-worker] fatal", error);
  process.exitCode = 1;
});
```

Add to `package.json`:

```json
"scripts": {
  "worker:recommendation": "tsx src/worker/recommendation-run-worker.ts"
}
```

Install runtime dependency:

```bash
npm install tsx@4
```

- [ ] **Step 3: Re-run worker tests**

Run: `npx vitest run tests/run-worker.test.ts -v`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add \
  package.json \
  package-lock.json \
  src/lib/recommendation/run-worker.ts \
  src/worker/recommendation-run-worker.ts \
  tests/run-worker.test.ts
git commit -m "$(cat <<'EOF'
feat: add recommendation run-worker process entry

Start an abortable poll loop with a heartbeat file for Compose healthchecks.
EOF
)"
```

---

### Task 6: Compose Packaging And Deployment Config Tests

**Files:**
- Modify: `Dockerfile`
- Modify: `deploy/aliyun/compose.yaml`
- Modify: `deploy/aliyun/production.env.example`
- Modify: `deploy/aliyun/README.md`
- Modify: `tests/aliyun-deployment-config.test.ts`

**Interfaces:**
- Consumes: Task 5 entry + heartbeat path
- Produces: private `run-worker` service with `restart: unless-stopped`, no `ports:`, depends on healthy `travel-gateway`

- [ ] **Step 1: Write failing deployment assertions**

Extend `tests/aliyun-deployment-config.test.ts`:

```ts
it("packages a private run-worker that does not publish a host port", async () => {
  const [dockerfile, compose, envExample] = await Promise.all([
    read("Dockerfile"),
    read("deploy/aliyun/compose.yaml"),
    read("deploy/aliyun/production.env.example"),
  ]);

  expect(dockerfile).toMatch(/^FROM node:22-slim AS worker$/m);
  expect(dockerfile).toMatch(/CMD \["npx", "tsx", "src\/worker\/recommendation-run-worker\.ts"\]/);
  expect(dockerfile).toMatch(/^USER node$/m);

  expect(compose).toMatch(/^  run-worker:/m);
  const workerSection = compose.split(/^  run-worker:/m)[1]?.split(/^  [a-z]/m)[0] ?? "";
  expect(workerSection).toContain("target: worker");
  expect(workerSection).not.toMatch(/^\s+ports:/m);
  expect(workerSection).toContain("TRAVEL_GATEWAY_URL: http://travel-gateway:8080");
  expect(workerSection).toContain("SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY:?required}");
  expect(workerSection).toContain("restart: unless-stopped");
  expect(workerSection).toContain("condition: service_healthy");
  expect(workerSection).toContain("run-worker-heartbeat");

  expect(envExample).toContain("RUN_WORKER_POLL_INTERVAL_MS=");
  expect(envExample).not.toMatch(/RUN_WORKER_POLL_INTERVAL_MS=\S+/);
});
```

Keep existing frontend/gateway assertions intact.

- [ ] **Step 2: Run deployment test to verify failure**

Run: `npx vitest run tests/aliyun-deployment-config.test.ts -v`

Expected: FAIL (no `run-worker` / no `AS worker`).

- [ ] **Step 3: Add Dockerfile worker target**

Append to root `Dockerfile` (do not change the default final stage used by frontend builds):

```dockerfile
FROM node:22-slim AS worker

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

USER node
CMD ["npx", "tsx", "src/worker/recommendation-run-worker.ts"]
```

Important: Compose frontend build must keep `target` unset / runtime stage so Next still builds. Only `run-worker` sets `target: worker`.

- [ ] **Step 4: Add Compose service**

Append under `services:` in `deploy/aliyun/compose.yaml`:

```yaml
  run-worker:
    build:
      context: ../..
      dockerfile: Dockerfile
      target: worker
    environment:
      NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL:?required}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY:?required}
      AMAP_API_KEY: ${AMAP_API_KEY:?required}
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY:?required}
      DEEPSEEK_MODEL: ${DEEPSEEK_MODEL:-deepseek-v4-flash}
      TRAVEL_GATEWAY_URL: http://travel-gateway:8080
      TRAVEL_GATEWAY_TOKEN: ${TRAVEL_GATEWAY_TOKEN:?required}
      TRAVEL_GATEWAY_TIMEOUT_MS: ${TRAVEL_GATEWAY_TIMEOUT_MS:-30000}
      AGENT_QUERY_CONCURRENCY: ${AGENT_QUERY_CONCURRENCY:-4}
      RUN_WORKER_POLL_INTERVAL_MS: ${RUN_WORKER_POLL_INTERVAL_MS:-3000}
      RUN_WORKER_HEARTBEAT_PATH: /tmp/run-worker-heartbeat
    depends_on:
      travel-gateway:
        condition: service_healthy
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "const fs=require('fs');const p=process.env.RUN_WORKER_HEARTBEAT_PATH||'/tmp/run-worker-heartbeat';const st=fs.statSync(p);if(Date.now()-st.mtimeMs>30000)process.exit(1)",
        ]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 40s
    restart: unless-stopped
    networks:
      - private
```

No `ports:` key.

Append empty placeholders to `deploy/aliyun/production.env.example`:

```
RUN_WORKER_POLL_INTERVAL_MS=
```

Update `deploy/aliyun/README.md` with a short “Services” note: frontend / travel-gateway / run-worker; worker advances automatic + alternative runs without browser POSTs; host confirmation remains manual; ECS acceptance should prove leave-and-finish.

- [ ] **Step 5: Re-run deployment tests and compose config**

Run:

```bash
npx vitest run tests/aliyun-deployment-config.test.ts -v
docker compose --env-file deploy/aliyun/.env.production -f deploy/aliyun/compose.yaml config --quiet
```

Expected: vitest PASS. Compose `config --quiet` succeeds when a local env file exists; if the env file is absent on the implementer’s machine, document that and still keep the unit test green.

- [ ] **Step 6: Commit**

```bash
git add \
  Dockerfile \
  deploy/aliyun/compose.yaml \
  deploy/aliyun/production.env.example \
  deploy/aliyun/README.md \
  tests/aliyun-deployment-config.test.ts
git commit -m "$(cat <<'EOF'
feat: package private Compose recommendation run-worker

Add an unexposed worker image target that advances runs beside the mainland frontend and gateway.
EOF
)"
```

---

### Task 7: Runtime Docs, Authority Index, And Verification

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/integration-guide.md`
- Modify: `docs/superpowers/README.md`
- Modify: `.superpowers/sdd/progress.md` (short ledger note only)
- Optionally extend: `docs/acceptance/2026-07-28-aliyun-mainland-phone-acceptance.md` with one leave-and-finish checkbox (if that checklist already exists on the branch)

**Interfaces:**
- Consumes: shipped Tasks 1–6 behavior
- Produces: operator-facing truth that China ECS uses three private services; Vercel remains browser-advance fallback

- [ ] **Step 1: Update architecture / integration**

In `docs/architecture.md` Runtime Shape:
- State Compose services are `frontend`, `travel-gateway`, and `run-worker`.
- State `run-worker` calls in-process `advanceRun` for automatic + alternative nonterminal statuses; no host port.
- State browser advance is optional; leave-and-finish is an ECS acceptance criterion.

In Data Flow / Core Modules:
- Mention `src/lib/recommendation/run-worker.ts` and `src/worker/recommendation-run-worker.ts`.
- Clarify alternative runs stop at `awaiting_host_confirmation` until host token confirmation.

In `docs/integration-guide.md` advance section:
- Note ECS worker keeps runs moving without client POSTs.
- Keep the authenticated advance route as optional accelerator / Vercel fallback.
- Mention `RUN_WORKER_POLL_INTERVAL_MS` and that stale expiry after worker downtime still surfaces `RUN_STALE_EXPIRED`.

- [ ] **Step 2: Update authority index**

Insert after the worker design entry in `docs/superpowers/README.md`:

```md
7. `plans/2026-07-28-background-recommendation-run-worker.md` — current Compose `run-worker` execution plan (2h stale foundation, leave-friendly UX, private worker loop).
```

Renumber subsequent entries as needed. Do not rewrite historical plan checklists.

- [ ] **Step 3: Full verification**

```bash
npx vitest run \
  tests/run-deadlines.test.ts \
  tests/recommendation-run-schema.test.ts \
  tests/run-worker.test.ts \
  tests/aliyun-deployment-config.test.ts \
  tests/result-page.test.ts \
  tests/public-plan-content.test.ts \
  tests/plan-read-route.test.ts
npm run lint
npm run test
npm run build
```

Expected: all green. No gateway package changes required; do not claim gateway rebuild unless touched.

- [ ] **Step 4: Operator migration reminder (non-code)**

Before ECS leave-and-finish acceptance:
1. Apply `supabase/migrations/202607280001_extend_active_run_stale_window.sql` to the linked Supabase project.
2. `docker compose ... up --build -d` so `run-worker` is healthy.
3. Start calculate/preview, close all browsers, wait until terminal or `awaiting_host_confirmation`.
4. Confirm worker logs show advances and lease still prevents double-work with one open result tab.

- [ ] **Step 5: Commit docs**

```bash
git add \
  docs/architecture.md \
  docs/integration-guide.md \
  docs/superpowers/README.md \
  .superpowers/sdd/progress.md \
  docs/acceptance/2026-07-28-aliyun-mainland-phone-acceptance.md
git commit -m "$(cat <<'EOF'
docs: document Compose recommendation run-worker topology

Record leave-and-finish on ECS, optional browser advance, and the 2h stale foundation.
EOF
)"
```

---

## Self-Review Checklist

| Design requirement | Task |
| --- | --- |
| Compose private `run-worker` (方案 2) | Task 6 |
| Advance automatic + alternative in pending/collecting/cooling_down/calculating/validating | Tasks 3–5 |
| Reuse lease + `advanceRun`; host confirm stays human | Tasks 4–5 (no confirm call); Task 7 docs |
| Users may leave; browser advance optional | Task 2 |
| 3s poll, ≤1 in-flight, immediate scan on start | Tasks 4–5 |
| cooling_down still calls advanceRun | Task 4 |
| Stop selecting awaiting_host_confirmation / terminals | Task 3 |
| Service-role + gateway env; no host port; no public advance-all API | Tasks 5–6 |
| Heartbeat healthcheck | Tasks 5–6 |
| 2h active stale / 7d confirmation | Task 1 (already in design + uncommitted diffs) |
| Leave-friendly + RUN_STALE_EXPIRED worker-down framing | Task 2 |
| Focused worker unit tests + compose config test | Tasks 3–4, 6 |
| Vercel worker not required | Global constraints + Task 7 |
| Fold uncommitted plan progress / 2h / copy work | Related work table + Tasks 1–2 |

Placeholder scan: no TBD/TODO steps; concrete files, commands, and code included.

Type consistency: `WorkerAdvanceableRun`, `runWorkerTick`, `runWorkerLoop`, `listWorkerAdvanceableRuns`, `workerPollIntervalMs`, `workerHeartbeatPath` names are stable across Tasks 3–6.
