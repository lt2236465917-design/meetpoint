# DeepSeek Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the real DeepSeek explanation path with configurable model selection, strict JSON validation, deterministic fallback, and a credential-safe live smoke check.

**Architecture:** Keep client construction and model configuration in `src/lib/ai/deepseek-client.ts`. Keep prompt construction, invocation, parsing, and fallback behavior in `src/lib/ai/recommendation-explainer.ts`, so calculation and API callers remain unchanged and cannot delegate ranking decisions to the model.

**Tech Stack:** TypeScript, Next.js 16 App Router, OpenAI SDK 6, Zod 4, Vitest 4.

## Global Constraints

- DeepSeek may only explain an already computed `CityRecommendation`.
- DeepSeek must not change tickets, candidates, scores, or recommendation ordering.
- `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL` are server-only.
- The default model is exactly `deepseek-v4-flash`.
- Missing credentials and every provider/output failure return deterministic fallback copy.
- No secret or raw provider response may be logged, returned, committed, or added to fixtures.
- Keep `POST /api/plans/[code]/explain` request and response shapes unchanged.
- Run `npm run lint`, `npm run test`, and `npm run build` before completion.

## File Map

- Modify `src/lib/ai/deepseek-client.ts`: client creation and model resolution.
- Modify `src/lib/ai/recommendation-explainer.ts`: strict schema, JSON prompt, request, parsing, fallback.
- Create `tests/deepseek-client.test.ts`: configuration tests.
- Modify `tests/provider-shells.test.ts`: request and fallback tests.
- Modify `.env.example`, `README.md`, and `docs/integration-guide.md`: setup and acceptance guidance.

---

### Task 1: Server-only client and model configuration

**Files:**
- Create: `tests/deepseek-client.test.ts`
- Modify: `src/lib/ai/deepseek-client.ts`

**Interfaces:**
- Consumes: `process.env.DEEPSEEK_API_KEY`, `process.env.DEEPSEEK_MODEL`.
- Produces: `createDeepSeekClient(): OpenAI | null`, `getDeepSeekModel(): string`.

- [ ] **Step 1: Write the failing tests**

Create `tests/deepseek-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("DeepSeek configuration", () => {
  it("does not create a client without an API key", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const { createDeepSeekClient } = await import("@/lib/ai/deepseek-client");
    expect(createDeepSeekClient()).toBeNull();
  });

  it("uses deepseek-v4-flash by default", async () => {
    vi.stubEnv("DEEPSEEK_MODEL", "");
    const { getDeepSeekModel } = await import("@/lib/ai/deepseek-client");
    expect(getDeepSeekModel()).toBe("deepseek-v4-flash");
  });

  it("uses the configured model override", async () => {
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v4-pro");
    const { getDeepSeekModel } = await import("@/lib/ai/deepseek-client");
    expect(getDeepSeekModel()).toBe("deepseek-v4-pro");
  });
});
```

- [ ] **Step 2: Verify RED**

Run `npm run test -- tests/deepseek-client.test.ts`.

Expected: FAIL because `getDeepSeekModel` is not exported.

- [ ] **Step 3: Implement the minimum configuration API**

Replace `src/lib/ai/deepseek-client.ts` with:

```ts
import OpenAI from "openai";

const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

export function getDeepSeekModel(): string {
  return process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL;
}

export function createDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ baseURL: "https://api.deepseek.com", apiKey });
}
```

- [ ] **Step 4: Verify GREEN**

Run `npm run test -- tests/deepseek-client.test.ts`.

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/deepseek-client.test.ts src/lib/ai/deepseek-client.ts
git commit -m "feat: configure DeepSeek model"
```

### Task 2: Strict structured explanation and fallback

**Files:**
- Modify: `tests/provider-shells.test.ts`
- Modify: `src/lib/ai/recommendation-explainer.ts`

**Interfaces:**
- Consumes: `createDeepSeekClient()`, `getDeepSeekModel()`, `CityRecommendation`.
- Produces: unchanged `explainRecommendation(recommendation: CityRecommendation): Promise<RecommendationExplanation>`.

- [ ] **Step 1: Extend the DeepSeek module mock**

Import and mock both functions:

```ts
import { createDeepSeekClient, getDeepSeekModel } from "@/lib/ai/deepseek-client";

vi.mock("@/lib/ai/deepseek-client", () => ({
  createDeepSeekClient: vi.fn(),
  getDeepSeekModel: vi.fn(() => "deepseek-v4-flash"),
}));
```

- [ ] **Step 2: Write a failing valid-response and request-contract test**

Add under `describe("explainRecommendation")`:

```ts
it("requests strict JSON from the configured model", async () => {
  const expected = {
    short_reason: "武汉兼顾团队费用与时间。",
    risk_badges: ["含估算"],
    share_summary: "推荐武汉作为本次见面城市。",
    detail_explanation: "数据均来自已计算结果。",
  };
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(expected) } }],
  });
  vi.mocked(createDeepSeekClient).mockReturnValue({
    chat: { completions: { create } },
  } as never);

  await expect(explainRecommendation(baseRecommendation)).resolves.toEqual(expected);
  expect(getDeepSeekModel).toHaveBeenCalled();
  expect(create).toHaveBeenCalledWith(expect.objectContaining({
    model: "deepseek-v4-flash",
    response_format: { type: "json_object" },
    max_tokens: 800,
  }));
  const request = create.mock.calls[0][0];
  expect(request.messages[0].content).toContain("JSON");
  expect(request.messages[0].content).toContain("short_reason");
  expect(request.messages[0].content).toContain("detail_explanation");
});
```

- [ ] **Step 3: Write failing fallback tests**

Add separate coverage for empty content, missing fields, extra fields, thrown requests, and no client:

```ts
it.each([
  ["empty content", { choices: [{ message: { content: "" } }] }],
  ["missing fields", { choices: [{ message: { content: JSON.stringify({ short_reason: "武汉" }) } }] }],
  ["extra fields", { choices: [{ message: { content: JSON.stringify({
    short_reason: "武汉",
    risk_badges: [],
    share_summary: "武汉",
    detail_explanation: "武汉",
    ranking_override: 1,
  }) } }] }],
])("falls back for %s", async (_name, response) => {
  vi.mocked(createDeepSeekClient).mockReturnValue({
    chat: { completions: { create: vi.fn().mockResolvedValue(response) } },
  } as never);
  await expect(explainRecommendation(baseRecommendation)).resolves.toEqual(
    fallbackExplanation(baseRecommendation),
  );
});

it("falls back when the request fails", async () => {
  vi.mocked(createDeepSeekClient).mockReturnValue({
    chat: { completions: { create: vi.fn().mockRejectedValue(new Error("network")) } },
  } as never);
  await expect(explainRecommendation(baseRecommendation)).resolves.toEqual(
    fallbackExplanation(baseRecommendation),
  );
});

it("falls back without a configured client", async () => {
  vi.mocked(createDeepSeekClient).mockReturnValue(null);
  await expect(explainRecommendation(baseRecommendation)).resolves.toEqual(
    fallbackExplanation(baseRecommendation),
  );
});
```

- [ ] **Step 4: Verify RED**

Run `npm run test -- tests/provider-shells.test.ts`.

Expected: request-contract and extra-field tests fail because model selection, `max_tokens`, and strict schema are missing.

- [ ] **Step 5: Implement the strict schema and prompt**

Update the imports and schema in `src/lib/ai/recommendation-explainer.ts`:

```ts
import { createDeepSeekClient, getDeepSeekModel } from "./deepseek-client";

const explanationSchema = z.object({
  short_reason: z.string().trim().min(1),
  risk_badges: z.array(z.string().trim().min(1)),
  share_summary: z.string().trim().min(1),
  detail_explanation: z.string().trim().min(1),
}).strict();

const explanationSystemPrompt = `你只根据输入的结构化推荐结果生成中文解释，不编造票价、车次、航班、时刻或其他事实。
必须输出 JSON，且只能包含以下结构：
{
  "short_reason": "一句简短推荐理由",
  "risk_badges": ["风险标签"],
  "share_summary": "一句可分享摘要",
  "detail_explanation": "一段详细解释"
}`;
```

Replace the request object with:

```ts
const response = await client.chat.completions.create({
  model: getDeepSeekModel(),
  response_format: { type: "json_object" },
  max_tokens: 800,
  messages: [
    { role: "system", content: explanationSystemPrompt },
    { role: "user", content: JSON.stringify(recommendation) },
  ],
});
```

Keep the existing catch, empty-content fallback, `JSON.parse`, `safeParse`, and deterministic fallback return.

- [ ] **Step 6: Verify GREEN and route compatibility**

Run `npm run test -- tests/provider-shells.test.ts tests/explain-route.test.ts`.

Expected: all tests in both files pass.

- [ ] **Step 7: Commit**

```bash
git add tests/provider-shells.test.ts src/lib/ai/recommendation-explainer.ts
git commit -m "feat: validate DeepSeek explanations"
```

### Task 3: Documentation and real-provider verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/integration-guide.md`

**Interfaces:**
- Consumes: completed configuration and explanation behavior.
- Produces: setup and acceptance guidance only.

- [ ] **Step 1: Document the model override**

Add after `DEEPSEEK_API_KEY=` in `.env.example`:

```dotenv
DEEPSEEK_MODEL=deepseek-v4-flash
```

Add to the README environment list and integration-guide environment table:

```markdown
- `DEEPSEEK_MODEL`: optional server-side model override; defaults to `deepseek-v4-flash`.
```

- [ ] **Step 2: Add the acceptance procedure**

Add this section to `docs/integration-guide.md`:

```markdown
## DeepSeek Acceptance

1. Store a valid `DEEPSEEK_API_KEY` only in `.env.local` and optionally set `DEEPSEEK_MODEL`; never paste the key into commands, logs, or documentation.
2. Run the local app, complete a fallback-mode plan calculation, and call `POST /api/plans/[code]/explain`.
3. Confirm the response is `{ "ok": true, "count": <latest recommendation count> }`.
4. Confirm the latest recommendations contain non-empty explanations while rankings, scores, and travel options remain unchanged.
5. Temporarily use an invalid key and repeat; confirm deterministic fallback explanations are stored and the endpoint still succeeds.
```

- [ ] **Step 3: Run full automated verification**

Run separately:

```bash
npm run lint
npm run test
npm run build
```

Expected: every command exits 0 and Vitest reports zero failures.

- [ ] **Step 4: Run the real DeepSeek smoke check**

Start with `npm run dev`, create and fill a local fallback plan, calculate it, and call its explain endpoint. Inspect only HTTP status, `{ ok, count }`, and rendered explanations. Do not print environment variables, authorization headers, or raw provider responses.

Expected: HTTP 200, `ok: true`, count matches recommendations, explanations are non-empty, and ranking is unchanged.

- [ ] **Step 5: Review diff and secret boundary**

Run:

```bash
git diff --check
git status --short
git diff -- .env.example README.md docs/integration-guide.md src/lib/ai/deepseek-client.ts src/lib/ai/recommendation-explainer.ts tests/deepseek-client.test.ts tests/provider-shells.test.ts
```

Expected: no secret appears, `.env.local` is absent from status, and the user's earlier integration-guide edits remain present.

- [ ] **Step 6: Commit documentation**

```bash
git add .env.example README.md docs/integration-guide.md
git commit -m "docs: document DeepSeek setup"
```
