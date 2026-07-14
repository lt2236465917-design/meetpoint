# 创建计划输入控件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让创建计划页的日期和到达时间整块区域打开原生选择器，并将人数限制为 2–6 的应用内选择面板。

**Architecture:** 保持日期与时间为受控的原生 `input`，在 WebKit/Chrome 中扩展浏览器自身 picker 指示器的命中区域，确保整块白色输入框走同一原生路径。人数使用应用内的 `listbox` 面板，选中后关闭；隐藏字段继续经 `parseCreatePlanForm` 规范化为数字，解析器拒绝非整数，和服务端 schema 的整数约束一致。

**Tech Stack:** Next.js App Router、React 19、TypeScript、Tailwind CSS、Vitest。

## Global Constraints

- 用户可见文案使用中文；代码、文件和变量名使用英文。
- 表单继续提交 `meetingDate`（`YYYY-MM-DD`）、`targetArrivalTime`（`HH:mm`）和数值 `participantLimit`。
- 不修改 API、数据库或创建流程；保留客户端与服务端 2–6 人校验。
- 日期和时间继续采用原生浏览器控件；人数采用应用内面板，避免桌面端系统下拉菜单破坏 H5 视觉一致性。
- 完成前运行 `npm run lint`、`npm run test` 和 `npm run build`。

---

### Task 1: Strengthen participant-limit form parsing

**Files:**
- Modify: `tests/create-plan-form.test.ts`
- Modify: `src/lib/ui/create-plan-form.ts`

**Interfaces:**
- Consumes: `parseCreatePlanForm(formData: FormData): ParseCreatePlanFormResult`
- Produces: a successful parse with `data.participantLimit: number` for select option strings `"2"`–`"6"`; an existing Chinese range error for non-integer or out-of-range values.

- [x] **Step 1: Write the failing test**

```ts
it("converts a native select option string into a valid participant limit", () => {
  const formData = new FormData();
  formData.set("title", "周末跨城见面测试");
  formData.set("meetingDate", "2026-08-15");
  formData.set("targetArrivalTime", "18:30");
  formData.set("participantLimit", "5");

  expect(parseCreatePlanForm(formData)).toMatchObject({
    ok: true,
    data: { participantLimit: 5 },
  });
});

it("rejects a fractional participant limit before submission", () => {
  const formData = new FormData();
  formData.set("title", "周末跨城见面测试");
  formData.set("meetingDate", "2026-08-15");
  formData.set("targetArrivalTime", "18:30");
  formData.set("participantLimit", "2.5");

  expect(parseCreatePlanForm(formData)).toEqual({
    ok: false,
    error: "参与人数需在 2-6 人之间",
  });
});
```

- [x] **Step 2: Run the focused test to verify the new invalid-value assertion fails**

Run: `npm run test -- tests/create-plan-form.test.ts`

Expected: the fractional-limit test fails because the parser currently accepts `2.5`.

- [x] **Step 3: Write the minimal parser change**

```ts
if (
  !Number.isInteger(participantLimit) ||
  participantLimit < 2 ||
  participantLimit > 6
) {
  return { ok: false, error: "参与人数需在 2-6 人之间" };
}
```

- [x] **Step 4: Run the focused parser tests to verify they pass**

Run: `npm run test -- tests/create-plan-form.test.ts`

Expected: all tests in the file pass.

### Task 2: Make native date/time regions and participant selection match the approved interaction

**Files:**
- Modify: `tests/create-plan-page.test.ts`
- Modify: `src/app/create/page.tsx`

**Interfaces:**
- Consumes: the existing controlled React state setters and WebKit/Chrome native picker indicator behavior.
- Produces: full-width native date/time picker hit areas; an application `listbox` with values 2–6, immediate close-on-selection behavior, and a hidden `participantLimit` form field.

- [x] **Step 1: Write the failing page contract test**

```ts
expect(pageSource).toContain('ref={meetingDateInputRef}');
expect(pageSource).toContain('ref={targetArrivalTimeInputRef}');
expect(pageSource).toContain('native-picker-hit-area');
expect(pageSource).toContain('role="listbox"');
expect(pageSource).toContain('setParticipantLimitOpen(false);');
expect(pageSource).toContain('name="participantLimit"');
expect(pageSource).toContain('type="hidden"');
expect(pageSource).not.toContain('type="number"');
```

- [x] **Step 2: Run the focused page contract test to verify it fails**

Run: `npm run test -- tests/create-plan-page.test.ts`

Expected: FAIL because the current page has no picker refs or `select` control.

- [x] **Step 3: Write the minimal UI implementation**

```tsx
const [participantLimitOpen, setParticipantLimitOpen] = useState(false);
```

Keep date and time as accessible native inputs, use `native-picker-hit-area` to enlarge the browser-owned WebKit/Chrome picker target, and add decorative icons that do not intercept clicks. Replace the number input with a controlled button/listbox offering exactly 2, 3, 4, 5, and 6; write the selection through a hidden `participantLimit` field and close the panel immediately after selection.

- [x] **Step 4: Run the focused page contract test to verify it passes**

Run: `npm run test -- tests/create-plan-page.test.ts`

Expected: PASS.

### Task 3: Verify user flow and project quality gates

**Files:**
- Verify: `src/app/create/page.tsx`
- Verify: `tests/create-plan-form.test.ts`
- Verify: `tests/create-plan-page.test.ts`

**Interfaces:**
- Consumes: local Next.js development server and browser viewport controls.
- Produces: evidence that controls update React state, submit a created plan, and retain the mobile-first layout.

- [x] **Step 1: Run the focused regression tests**

Run: `npm run test -- tests/create-plan-form.test.ts tests/create-plan-page.test.ts`

Expected: PASS.

- [x] **Step 2: Run project quality gates**

Run: `npm run lint && npm run test && npm run build`

Expected: all three commands exit 0.

- [ ] **Step 3: Perform manual native-picker acceptance at 390×844**

Open `/create`; tap the date label, blank date field area, and calendar icon area, then choose a date. Repeat for time. Change the participant panel to 2, 3, 4, 5, and 6 in turn; submit a plan and confirm the success summary shows the selected values.

- [x] **Step 4: Check the ticket gateway before real-price revalidation**

Run: `curl --silent --show-error --fail http://127.0.0.1:8080/healthz`

Expected: `{ "status": "ok" }`. If unavailable, report the failed precondition and do not state that real-price recalculation was verified.

### Task 4: Keep incomplete calculations out of the result flow

**Files:**
- Modify: `tests/public-plan-content.test.ts`
- Modify: `tests/result-page.test.ts`
- Modify: `src/components/plan/PublicPlanContent.tsx`
- Modify: `src/app/p/[code]/result/page.tsx`
- Add: `src/components/result/RefreshingResultNotice.tsx`

- [x] **Step 1: Write failing rendering tests for a `running` recommendation run**
- [x] **Step 2: Show a disabled result action and explicit generation state on the plan page**
- [x] **Step 3: While its run is `running`, refresh the result page locally at most 10 times, keep a manual refresh action, and render cards only for `completed`**
- [x] **Step 4: Run focused and full quality gates**
