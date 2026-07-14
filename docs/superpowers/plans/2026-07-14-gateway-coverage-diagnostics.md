# 票价网关覆盖率与供应商降级诊断 Implementation Plan

**执行状态（2026-07-14）：** Task 1–4 已完成并提交（`7ef98bd`、`a624048`、`56f1eb1`、`3ba0f88`），根项目与网关的 lint、test、build 均已通过。供应商现场复验记录到 24 个预期路线组中的 9 个 `SUCCESS`、2 个 `PROVIDER_INVALID_RESPONSE`、7 个 `PROVIDER_RATE_LIMITED` 和 6 个未进入网关诊断的组；这说明脱敏诊断与逐项容错已生效，但不构成供应商恢复或覆盖率达标证明。原始步骤复选框保留为实施记录。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留 live 响应中的有效飞猪真实路线、为规范化失败提供可关联的脱敏诊断，并消除主应用在供应商限流后的同模式即时重试。

**Architecture:** FlyAI 适配器把 live `data.itemList` 外层与每个条目分开校验，生成只含路线指纹、字段名和计数的诊断事件。网关服务在实际使用 FlyAI 适配器时写入该事件；自定义 provider 测试不产生日志。主应用仅重试可恢复的网络/可用性错误，限流立即落为带稳定原因的估算行。

**Tech Stack:** TypeScript、Node.js Crypto、Zod 4、Vitest 4、Next.js 16。

## Global Constraints

- 用户可见文案使用中文；代码、文件和 commit message 使用英文。
- 网关只负责 FlyAI 凭据、CLI、校验、超时、重试、缓存、限流、脱敏诊断和稳定错误；不得生成候选城市、选路、评分、调用 DeepSeek 或持久化参与者身份。
- 只记录交通方式、不会直接包含原始字段的哈希路线指纹、字段名、条目计数、校验类别和稳定错误码；不得记录城市名、服务编号、票价、时间、URL、原始 stdout/stderr、供应商错误正文、密钥或参与者信息。
- 默认网关并发为 `1`；同 key 在途合并；仅缓存成功规范化响应；`PROVIDER_RATE_LIMITED` 仍由网关执行 5 秒/15 秒冷却且不在网关立即重试。
- 主应用对 `PROVIDER_RATE_LIMITED` 不得再发起同模式即时重试；估算行必须保留该稳定码。
- 真实行保持“飞猪参考价”，无法获得真实数据的行保持“估算”并显示稳定原因；`/healthz` 不能作为供应商放行证明。
- 完成前分别执行根项目和 `services/travel-provider-gateway/` 的 `lint`、`test`、`build`；不自动 push。

## File Map

- Modify `services/travel-provider-gateway/src/flyai-adapter.ts`: 逐项解析 live 条目、错误信封分类、诊断事件类型和路线指纹。
- Modify `services/travel-provider-gateway/src/service.ts`: 只在默认 FlyAI provider 路径写出结构化诊断。
- Modify `services/travel-provider-gateway/tests/flyai-adapter.test.ts`: live 混合条目、错误信封和敏感数据不出现在诊断中的回归测试。
- Modify `services/travel-provider-gateway/tests/service.test.ts`: 服务默认路径的诊断写出与 mock provider 隔离测试。
- Modify `src/lib/travel/flyai-provider.ts`: 从即时重试集合中移除 `PROVIDER_RATE_LIMITED`。
- Create `tests/flyai-provider.test.ts`: 限流仅调用网关一次、其他暂态错误仍重试一次。
- Modify `README.md`, `docs/architecture.md`, `docs/integration-guide.md`: 更新诊断字段、live 容错语义和限流重试边界。

---

### Task 1: 使 FlyAI live 条目容错并生成脱敏诊断

**Files:**
- Modify: `services/travel-provider-gateway/src/flyai-adapter.ts`
- Modify: `services/travel-provider-gateway/tests/flyai-adapter.test.ts`

**Interfaces:**
- Produces `FlyAIDiagnostic` with `routeFingerprint`, `mode`, `outcome`, `topLevelKeys`, `dataKeys`, `itemKeys`, `itemCount`, `normalizedCount`, `droppedCount`, `droppedReasons`, and `cliErrorCode`.
- Extends `FlyAIAdapterDependencies` with `diagnosticLogger?: (event: FlyAIDiagnostic) => void`.
- Keeps `searchFlyAI(input, dependencies): Promise<GatewayTravelOption[]>` unchanged.

- [ ] **Step 1: 写入两个失败测试**

在 `services/travel-provider-gateway/tests/flyai-adapter.test.ts` 先添加以下 fixture，再添加测试。第二个 item 缺少 `marketingTransportNo`，第一个 item 仍必须返回真实行；断言只检查字段名与计数，绝不检查供应商原文。

```ts
const liveFlightItem = {
  ticketPrice: "680",
  totalDuration: "02:15:00",
  jumpUrl: "https://a.feizhu.com/flight/MU5101",
  journeys: [{
    segments: [{
      depDateTime: "2026-08-20 08:00:00",
      arrDateTime: "2026-08-20 10:15:00",
      duration: "02:15:00",
      marketingTransportNo: "MU5101",
      transportType: "flight",
      depStationName: "北京首都",
      arrStationName: "上海虹桥",
    }],
  }],
};
```

```ts
it("keeps valid live items when a sibling item is malformed", async () => {
  const diagnostics: unknown[] = [];
  const execFile = executorReturning({
    data: { itemList: [
      liveFlightItem,
      { ...liveFlightItem, journeys: [{ segments: [{ ...liveFlightItem.journeys[0].segments[0], marketingTransportNo: undefined }] }] },
    ] },
  });

  const result = await searchFlyAI(baseInput, {
    execFile, executable: "/safe/flyai", diagnosticLogger: (event) => diagnostics.push(event),
  });

  expect(result).toHaveLength(1);
  expect(diagnostics).toEqual([expect.objectContaining({
    mode: "flight", outcome: "SUCCESS", itemCount: 2, normalizedCount: 1,
    droppedCount: 1, droppedReasons: ["invalid_item_shape"], cliErrorCode: null,
  })]);
});

it("classifies a live error envelope without leaking its text into diagnostics", async () => {
  const secret = "supplier-detail=do-not-log";
  const diagnostics: unknown[] = [];
  const execFile = executorReturning({ code: "429", message: `Too many requests ${secret}` });

  await expect(searchFlyAI(baseInput, {
    execFile, executable: "/safe/flyai", diagnosticLogger: (event) => diagnostics.push(event),
  })).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });

  expect(JSON.stringify(diagnostics)).not.toContain(secret);
  expect(diagnostics).toEqual([expect.objectContaining({
    outcome: "PROVIDER_RATE_LIMITED", itemCount: 0, normalizedCount: 0,
  })]);
});
```

- [ ] **Step 2: 验证 RED**

在 `services/travel-provider-gateway/` 运行：

```bash
npm run test -- tests/flyai-adapter.test.ts
```

预期：第一项因整个 `itemList` 的严格 schema 被拒绝而失败；第二项因错误信封被归为 `PROVIDER_INVALID_RESPONSE` 而失败。

- [ ] **Step 3: 实现最小容错解析和诊断类型**

在 `flyai-adapter.ts` 使用 `node:crypto` 的 `createHash` 添加以下类型和辅助函数；路线指纹只能使用城市代码、日期和方式，不能使用城市名。

```ts
export type FlyAIDiagnostic = {
  routeFingerprint: string;
  mode: GatewaySearchRequest["mode"];
  outcome: "SUCCESS" | GatewayErrorCode;
  topLevelKeys: string[];
  dataKeys: string[];
  itemKeys: string[];
  itemCount: number;
  normalizedCount: number;
  droppedCount: number;
  droppedReasons: string[];
  cliErrorCode: GatewayErrorCode | null;
};

function routeFingerprint(input: GatewaySearchRequest): string {
  const routeKey = ["v1", input.originCityCode, input.destinationCityCode, input.meetingDate, input.mode].join(":");
  return createHash("sha256").update(routeKey).digest("hex").slice(0, 16);
}

function emitDiagnostic(
  logger: FlyAIAdapterDependencies["diagnosticLogger"],
  event: FlyAIDiagnostic,
) {
  try {
    logger?.(event);
  } catch {
    // Diagnostics must not affect ticket availability.
  }
}
```

将 live 外层 schema 改为 `data.itemList: z.array(z.unknown())`。逐条对 `liveItemSchema.safeParse(item)`：失败时添加 `invalid_item_shape`；`normalizeLiveItem` 返回 `null` 时添加 `missing_required_route_fact`；成功条目才交给既有 `normalizeRow`。`itemList` 非空且没有任何可规范化行时抛出 `FlyAIAdapterError("PROVIDER_INVALID_RESPONSE", ...)`。空 `itemList` 仍返回 `[]`，保持“无可用行”而不是估算的现有语义。

抽取只供本地控制流使用的 `classifyProviderText(text): GatewayErrorCode | null`，复用现有无路线、无票、限流和上游不可用正则。对于没有 `data.itemList` 的 JSON，只读取 `code`、`message`、`status` 字符串传入该函数；识别到的码抛出对应 `FlyAIAdapterError`，未知对象仍抛 `PROVIDER_INVALID_RESPONSE`。不得把这些值写入错误、诊断或 HTTP 响应。

在 `searchFlyAI` 的成功、错误信封、全无效条目、CLI 错误和 JSON 解析失败路径调用 `emitDiagnostic`。诊断中的 key 数组最多保留前 32 个排序后字段名，`droppedReasons` 去重排序；任何路径都不得写入 stdout、stderr、错误正文或票价值。

- [ ] **Step 4: 验证 GREEN**

在 `services/travel-provider-gateway/` 运行：

```bash
npm run test -- tests/flyai-adapter.test.ts
```

预期：所有适配器测试通过；新测试证明一条坏 live 条目不会吞掉同响应的有效行，错误信封映射为稳定码且诊断不含秘密。

- [ ] **Step 5: 提交任务**

```bash
git add services/travel-provider-gateway/src/flyai-adapter.ts services/travel-provider-gateway/tests/flyai-adapter.test.ts
git commit -m "fix: tolerate malformed FlyAI items"
```

### Task 2: 仅在默认网关调用路径写入诊断事件

**Files:**
- Modify: `services/travel-provider-gateway/src/service.ts`
- Modify: `services/travel-provider-gateway/tests/service.test.ts`

**Interfaces:**
- Extends `createTravelSearchService` dependencies with `diagnosticLogger?: (event: FlyAIDiagnostic) => void`.
- Default `searchProvider` calls `searchFlyAI(input, { diagnosticLogger })`; an explicitly injected `searchProvider` remains untouched.

- [ ] **Step 1: 写入失败测试**

在 `service.test.ts` 的 import 前添加以下 hoisted mock；它保留真实的 `FlyAIAdapterError`，仅替换 CLI 调用函数。

```ts
const searchFlyAIMock = vi.hoisted(() => vi.fn());

vi.mock("../src/flyai-adapter.js", async () => {
  const actual = await vi.importActual<typeof import("../src/flyai-adapter.js")>("../src/flyai-adapter.js");
  return { ...actual, searchFlyAI: searchFlyAIMock };
});
```

随后添加测试，mock 默认 adapter 并收集 logger 调用；同时保留一个显式 `searchProvider` 测试来证明服务不会伪造供应商诊断。

```ts
it("passes the gateway diagnostic logger only to the default FlyAI adapter", async () => {
  const diagnosticLogger = vi.fn();
  searchFlyAIMock.mockRejectedValueOnce(new FlyAIAdapterError("PROVIDER_NO_ROUTE", "detail"));
  const service = createTravelSearchService({ diagnosticLogger });

  await expect(service.search(request)).rejects.toBeDefined();
  expect(searchFlyAIMock).toHaveBeenCalledWith(request, { diagnosticLogger });
});

it("does not call a diagnostic logger for an injected provider", async () => {
  const diagnosticLogger = vi.fn();
  const service = createTravelSearchService({ searchProvider: vi.fn().mockResolvedValue([option]), diagnosticLogger });

  await service.search(request);
  expect(diagnosticLogger).not.toHaveBeenCalled();
});
```

Mock `../src/flyai-adapter.js` before importing `service.ts`; make `searchFlyAIMock` reject a typed `FlyAIAdapterError` so the first assertion never starts the real CLI.

- [ ] **Step 2: 验证 RED**

在 `services/travel-provider-gateway/` 运行：

```bash
npm run test -- tests/service.test.ts
```

预期：失败，因为当前默认 `searchFlyAI` 没有收到 `diagnosticLogger`。

- [ ] **Step 3: 实现默认日志写入路径**

在 `service.ts` 导入 `FlyAIDiagnostic` 和 `searchFlyAI`，并使用如下默认 provider 构造，保留已有 `searchProvider` 注入优先级：

```ts
interface ServiceDependencies {
  searchProvider?: (input: GatewaySearchRequest) => Promise<unknown>;
  diagnosticLogger?: (event: FlyAIDiagnostic) => void;
  cache?: TtlCache<GatewaySearchResponse>;
  limiter?: FifoLimiter;
  now?: () => Date;
}

const searchProvider = dependencies.searchProvider ?? ((request) =>
  searchFlyAI(request, { diagnosticLogger: dependencies.diagnosticLogger ?? writeGatewayDiagnostic }),
);

function writeGatewayDiagnostic(event: FlyAIDiagnostic) {
  console.info(JSON.stringify({ event: "flyai_diagnostic", ...event }));
}
```

`writeGatewayDiagnostic` 只能序列化 `FlyAIDiagnostic` 的字段，不能接收或附加 request、error、stdout、stderr。不要改变缓存、in-flight 合并、冷却、重试或 HTTP 错误映射。

- [ ] **Step 4: 验证 GREEN**

在 `services/travel-provider-gateway/` 运行：

```bash
npm run test -- tests/service.test.ts
```

预期：服务测试全部通过；默认路径接收 logger，显式测试 provider 不被服务额外记录。

- [ ] **Step 5: 提交任务**

```bash
git add services/travel-provider-gateway/src/service.ts services/travel-provider-gateway/tests/service.test.ts
git commit -m "feat: log redacted gateway diagnostics"
```

### Task 3: 取消主应用对限流的即时重试

**Files:**
- Modify: `src/lib/travel/flyai-provider.ts`
- Create: `tests/flyai-provider.test.ts`

**Interfaces:**
- `FlyAITravelProvider.search(input)` 继续返回 `TravelOption[]`。
- `GatewayClientError("PROVIDER_RATE_LIMITED")` 直接形成一条 `source: "estimated"`、`failureReason: "PROVIDER_RATE_LIMITED"` 的路线，不再第二次调用 `searchGateway`。

- [ ] **Step 1: 写入失败测试**

创建 `tests/flyai-provider.test.ts`，mock `@/lib/travel/gateway-client` 的 `searchGateway` 和 `GatewayClientError`。使用一个仅接受 `flight` 的输入，添加以下两项测试：

```ts
it("does not immediately retry a rate-limited mode", async () => {
  searchGatewayMock.mockRejectedValue(new GatewayClientError("PROVIDER_RATE_LIMITED"));

  const result = await new FlyAITravelProvider().search(input);

  expect(searchGatewayMock).toHaveBeenCalledTimes(1);
  expect(result).toEqual([expect.objectContaining({
    source: "estimated", provider: "estimate", mode: "flight",
    failureReason: "PROVIDER_RATE_LIMITED",
  })]);
});

it("retries a provider timeout once before returning real rows", async () => {
  searchGatewayMock
    .mockRejectedValueOnce(new GatewayClientError("PROVIDER_TIMEOUT"))
    .mockResolvedValueOnce(gatewayResponse);

  const result = await new FlyAITravelProvider().search(input);

  expect(searchGatewayMock).toHaveBeenCalledTimes(2);
  expect(result).toEqual([expect.objectContaining({ source: "real", provider: "flyai" })]);
});
```

`gatewayResponse` 必须包含一个符合 `gateway-client.ts` schema 的 flight option 和 offset `queriedAt`，使测试覆盖真实的适配与排序路径。

- [ ] **Step 2: 验证 RED**

在仓库根目录运行：

```bash
npm run test -- tests/flyai-provider.test.ts
```

预期：第一项失败，因为当前 retry 列表包含 `PROVIDER_RATE_LIMITED`，调用次数为 2。

- [ ] **Step 3: 实现最小改动**

在 `src/lib/travel/flyai-provider.ts` 的 `isRetryableGatewayError` 中删除唯一的 `"PROVIDER_RATE_LIMITED"` 字符串；其他五类错误和 `searchMode` 的估算降级逻辑不变：

```ts
return error instanceof GatewayClientError && [
  "GATEWAY_TIMEOUT",
  "GATEWAY_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_UPSTREAM_UNAVAILABLE",
].includes(error.code);
```

- [ ] **Step 4: 验证 GREEN**

在仓库根目录运行：

```bash
npm run test -- tests/flyai-provider.test.ts
```

预期：两个测试通过；限流只查一次，超时仍查两次并返回真实行。

- [ ] **Step 5: 提交任务**

```bash
git add src/lib/travel/flyai-provider.ts tests/flyai-provider.test.ts
git commit -m "fix: avoid retrying rate-limited fare searches"
```

### Task 4: 更新运维说明并执行质量门禁

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/integration-guide.md`

**Interfaces:**
- 文档把 `flyai_diagnostic` 定义为仅服务器日志事件，不属于 HTTP contract、缓存或数据库。
- 文档说明混合 live 条目可保留有效真实行，`PROVIDER_RATE_LIMITED` 不会由主应用即时重试。

- [ ] **Step 1: 写入文档修改**

在三个文件中加入一致的表述：网关日志事件名为 `flyai_diagnostic`，只含 `routeFingerprint`、`mode`、`outcome`、字段名数组、条目计数、丢弃类别和 `cliErrorCode`；不含供应商原文或个人数据。说明 `itemList` 单条异常不会丢弃相邻有效行，只有没有有效项时才返回 `PROVIDER_INVALID_RESPONSE`。将所有“主应用对 `PROVIDER_RATE_LIMITED` 会二次查询”的表述改为“主应用不即时重试，网关冷却后由后续请求决定是否恢复”。

- [ ] **Step 2: 验证文档一致性**

在仓库根目录运行：

```bash
rg -n "PROVIDER_RATE_LIMITED|flyai_diagnostic|itemList" README.md docs/architecture.md docs/integration-guide.md
```

预期：三份文档均说明稳定码、脱敏字段和“不把 healthz 当供应商放行证明”，没有“限流即时重试”的旧描述。

- [ ] **Step 3: 执行网关质量门禁**

在 `services/travel-provider-gateway/` 依次运行：

```bash
npm run lint
npm run test
npm run build
```

预期：三个命令退出码均为 0。

- [ ] **Step 4: 执行主应用质量门禁**

在仓库根目录依次运行：

```bash
npm run lint
npm run test
npm run build
```

预期：三个命令退出码均为 0。

- [ ] **Step 5: 现场复验并提交任务**

等待上次 `PROVIDER_RATE_LIMITED` 后的冷却窗口结束，创建新的完整计划。只读取网关 `flyai_diagnostic` 日志和结果页，使用探测清单计算的路线指纹输出“出发地 × 候选城市 × 方式 → SUCCESS / 空结果 / 稳定错误码”表，统计真实行比例。确认真实行显示“飞猪参考价”，失败行显示“估算 · 原因 <稳定码>”；不要以 `/healthz` 作为供应商恢复结论。完成后提交：

```bash
git add README.md docs/architecture.md docs/integration-guide.md
git commit -m "docs: document fare diagnostics and fallback"
```

真实移动设备日期/时间原生选择器验收不属于本实施计划；在具备设备后单独记录结果。
