# Inner Atmosphere Continuity + Meetup Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved 2026-07-18 design: plan/result/records light scenic continuity (home scene memory), create/join static deepen, host CTA「开始见面」, merged prefecture departure search, upward participant dropdown.

**Architecture:** Keep `ResponsiveShell` as the adaptive page chrome. Add an optional client `ShellScenicBackdrop` behind non-form shells. Persist home scene index in `localStorage` via a tiny preference helper. Copy changes stay in UI/error maps only — recommendation validators and `SAFE_EXPLANATIONS_ZH` stay untouched. City coverage widens at search-merge time; meeting candidates remain hub `CITIES`.

**Tech Stack:** Next.js App Router, React client islands, Vitest + `renderToStaticMarkup` / source-read tests, existing `SCENIC_VIDEOS` CloudFront clips, server `AMAP_API_KEY` city search.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-inner-atmosphere-meetup-copy-design.md`
- User-facing copy in Chinese; code/commits in English
- Create/join: **no** looping scenic video; plan/result/records: muted low-opacity video under scrim
- Host CTA:「开始见面」/「见面安排中」— no「计算」「开算」「算出见面城市」on primary CTAs or plan status lines
- Meeting candidates / distance / `CITIES` hub library unchanged
- Do not deep-restyle alternatives/manage IA (only shared string fixes if they still say「计算」)
- Do not change `SAFE_EXPLANATIONS_ZH` members
- Verify with `npm run lint`, `npm run test`, `npm run build` before claiming done
- Prefer TDD: failing test → implement → pass → commit (ask user before commit if their rules require it)

## File map

| File | Responsibility |
| --- | --- |
| Create: `src/lib/ui/scenic-preference.ts` | Read/write `meetpoint:scenic-scene` (0–3 index) |
| Create: `src/components/layout/ShellScenicBackdrop.tsx` | Client muted video + reduced-motion/error fallback |
| Modify: `src/components/layout/ResponsiveShell.tsx` | Optional `scenic` prop; stack backdrop under content |
| Modify: `src/components/home/HomeHero.tsx` | Persist scene on change; hydrate from preference |
| Modify: `src/app/globals.css` | Deepen `.atmosphere-canvas`; add `.shell-scenic-*` |
| Modify: `src/app/p/[code]/page.tsx`, `result/page.tsx`, `records/page.tsx` | `scenic` enabled |
| Modify: `src/components/plan/PublicPlanContent.tsx` | Meetup CTA + status copy |
| Modify: `src/lib/ui/api-error-message.ts` + create/manage/result strings | Error/helper copy |
| Modify: `src/lib/city/city-provider.ts` | Merge local + Amap results |
| Modify: `src/components/forms/CityCombobox.tsx` | Empty hint + placeholder |
| Modify: `src/app/create/page.tsx` | Upward dropdown + footer copy |
| Modify: tests + AGENTS/visual-direction/architecture/README | Lock behavior + authority sync |

---

### Task 1: Scenic preference helper

**Files:**
- Create: `src/lib/ui/scenic-preference.ts`
- Create: `tests/scenic-preference.test.ts`
- Modify: `src/components/home/HomeHero.tsx` (wire persist/hydrate)
- Test: `tests/scenic-preference.test.ts`, `tests/home-page.test.ts` (source assert if needed)

**Interfaces:**
- Consumes: `SCENIC_VIDEOS.length` from `@/lib/ui/scenic-videos`
- Produces:
  - `export const SCENIC_SCENE_STORAGE_KEY = "meetpoint:scenic-scene"`
  - `export function readScenicSceneIndex(): number` — SSR-safe (`0` when `window` missing); clamps to `0..SCENIC_VIDEOS.length-1`; invalid → `0`
  - `export function writeScenicSceneIndex(index: number): void` — no-op without `window`; clamps before write

- [ ] **Step 1: Write the failing test**

```ts
// tests/scenic-preference.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SCENIC_SCENE_STORAGE_KEY,
  readScenicSceneIndex,
  writeScenicSceneIndex,
} from "@/lib/ui/scenic-preference";

describe("scenic preference", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("defaults to 0 when unset", () => {
    expect(readScenicSceneIndex()).toBe(0);
  });

  it("round-trips a valid index", () => {
    writeScenicSceneIndex(2);
    expect(localStorage.getItem(SCENIC_SCENE_STORAGE_KEY)).toBe("2");
    expect(readScenicSceneIndex()).toBe(2);
  });

  it("clamps out-of-range values to 0 on read", () => {
    localStorage.setItem(SCENIC_SCENE_STORAGE_KEY, "99");
    expect(readScenicSceneIndex()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scenic-preference.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement helper + HomeHero wire**

```ts
// src/lib/ui/scenic-preference.ts
import { SCENIC_VIDEOS } from "@/lib/ui/scenic-videos";

export const SCENIC_SCENE_STORAGE_KEY = "meetpoint:scenic-scene";

function clampIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= SCENIC_VIDEOS.length) {
    return 0;
  }
  return index;
}

export function readScenicSceneIndex(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(SCENIC_SCENE_STORAGE_KEY);
  if (raw == null) return 0;
  return clampIndex(Number.parseInt(raw, 10));
}

export function writeScenicSceneIndex(index: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    SCENIC_SCENE_STORAGE_KEY,
    String(clampIndex(index)),
  );
}
```

In `HomeHero.tsx`:
- Initialize `activeVideo` from `readScenicSceneIndex()` (lazy `useState` initializer).
- Inside the path that successfully changes scene (`activateVideo` / `switchVideo` success), call `writeScenicSceneIndex(index)`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/scenic-preference.test.ts tests/home-page.test.ts`
Expected: PASS

- [ ] **Step 5: Commit** (if user requested commits)

```bash
git add src/lib/ui/scenic-preference.ts tests/scenic-preference.test.ts src/components/home/HomeHero.tsx
git commit -m "$(cat <<'EOF'
feat: persist home scenic scene preference

EOF
)"
```

---

### Task 2: Shell scenic backdrop + ResponsiveShell prop

**Files:**
- Create: `src/components/layout/ShellScenicBackdrop.tsx`
- Modify: `src/components/layout/ResponsiveShell.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/p/[code]/page.tsx`, `src/app/p/[code]/result/page.tsx`, `src/app/records/page.tsx` — pass `scenic`
- Modify: `tests/responsive-shell.test.ts`, `tests/peak-scenic-accent.test.ts`, `tests/atmosphere-tokens.test.ts`
- Do **not** pass `scenic` on create/join/alternatives/manage

**Interfaces:**
- Consumes: `readScenicSceneIndex`, `SCENIC_VIDEOS`
- Produces: `ResponsiveShell` prop `scenic?: boolean` (default `false`)
- `ShellScenicBackdrop`: client component, no props required

- [ ] **Step 1: Write failing tests**

Extend `tests/responsive-shell.test.ts`:

```ts
it("renders a light scenic backdrop only when scenic is enabled", () => {
  const withScenic = renderToStaticMarkup(
    createElement(ResponsiveShell, { title: "计划", scenic: true }, "body"),
  );
  const without = renderToStaticMarkup(
    createElement(ResponsiveShell, { title: "创建" }, "body"),
  );

  expect(withScenic).toContain("shell-scenic");
  expect(without).not.toContain("shell-scenic");
});
```

Update `tests/peak-scenic-accent.test.ts` — replace the old “no video in ResponsiveShell” assertion with:

```ts
it("keeps create/join form trees free of shell scenic video wiring", () => {
  const root = process.cwd();
  for (const relative of [
    "src/app/create/page.tsx",
    "src/components/plan/JoinParticipantForm.tsx",
    "src/app/p/[code]/join/page.tsx",
  ]) {
    const source = readFileSync(path.join(root, relative), "utf8");
    expect(source).not.toContain("scenic");
    expect(source).not.toContain("ShellScenicBackdrop");
    expect(source).not.toContain("<video");
  }
});

it("enables shell scenic on plan, result, and records pages only", () => {
  const root = process.cwd();
  expect(readFileSync(path.join(root, "src/app/p/[code]/page.tsx"), "utf8")).toContain("scenic");
  expect(readFileSync(path.join(root, "src/app/p/[code]/result/page.tsx"), "utf8")).toContain("scenic");
  expect(readFileSync(path.join(root, "src/app/records/page.tsx"), "utf8")).toContain("scenic");
  expect(readFileSync(path.join(root, "src/app/create/page.tsx"), "utf8")).not.toMatch(/\bscenic\b/);
});
```

Extend `tests/atmosphere-tokens.test.ts` to require `.shell-scenic`, `.shell-scenic-media`, and `prefers-reduced-motion` rules for shell scenic.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/responsive-shell.test.ts tests/peak-scenic-accent.test.ts tests/atmosphere-tokens.test.ts`

- [ ] **Step 3: Implement backdrop + CSS + wire pages**

`ShellScenicBackdrop.tsx` (client):
- On mount, `index = readScenicSceneIndex()`, pick `SCENIC_VIDEOS[index]`
- If `matchMedia('(prefers-reduced-motion: reduce)')` → render only fallback div, no `<video>`
- Else render muted `autoPlay` `loop` `playsInline` video + `.scenic-fallback` under `.shell-scenic-media`
- `onError` → hide video (fallback remains)

CSS (add near atmosphere tokens):

```css
.shell-scenic {
  pointer-events: none;
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: 0;
}

.shell-scenic-media {
  position: absolute;
  inset: 0;
}

.shell-scenic-media video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.28;
}

.shell-scenic-media::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(8, 10, 14, 0.72) 0%, rgba(8, 10, 14, 0.88) 100%),
    radial-gradient(ellipse at 50% 30%, rgba(20, 28, 40, 0.35) 0%, rgba(8, 10, 14, 0.9) 70%);
}

@media (prefers-reduced-motion: reduce) {
  .shell-scenic-media video {
    display: none;
  }
}
```

`ResponsiveShell.tsx`:

```tsx
export function ResponsiveShell({
  scenic = false,
  ...
}: {
  scenic?: boolean;
  // existing props
}) {
  return (
    <main className="atmosphere-shell atmosphere-canvas relative min-h-svh overflow-hidden">
      {scenic ? <ShellScenicBackdrop /> : null}
      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-2xl flex-col">
        {/* existing header / section / aside unchanged */}
      </div>
    </main>
  );
}
```

Note: section still uses `overflow-y-auto` for long content; outer `overflow-hidden` is OK if inner section scrolls. If scroll breaks, move `overflow-hidden` only onto the scenic layer, not `main`.

Pages: `<ResponsiveShell scenic …>` on plan (`page.tsx`), result, records (including not-found shells on those routes if they use the same shell and should match).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/responsive-shell.test.ts tests/peak-scenic-accent.test.ts tests/atmosphere-tokens.test.ts tests/records-page.test.ts`
Expected: PASS

- [ ] **Step 5: Commit** (if requested)

```bash
git commit -m "$(cat <<'EOF'
feat: add light scenic backdrop to plan result records shells

EOF
)"
```

---

### Task 3: Deepen static atmosphere canvas (create/join)

**Files:**
- Modify: `src/app/globals.css` (`.atmosphere-canvas` layered gradients + optional noise via CSS only)
- Modify: `tests/atmosphere-tokens.test.ts` — assert multi-stop / deeper stops still present; keep ink/muted tokens

**Interfaces:**
- Consumes: existing `.atmosphere-*` class names
- Produces: richer static canvas; no new React API

- [ ] **Step 1: Tighten token test**

Assert `.atmosphere-canvas` background declaration includes at least two `radial-gradient` occurrences (or one radial + one linear) and still contains `#0a0c10`.

- [ ] **Step 2: Run — may FAIL if still single gradient**

- [ ] **Step 3: Update `.atmosphere-canvas`**

Example direction (tune by eye on `/create`):

```css
.atmosphere-canvas {
  background:
    radial-gradient(ellipse at 50% 18%, rgba(90, 110, 130, 0.45) 0%, transparent 42%),
    radial-gradient(ellipse at 50% 40%, #2a3544 0%, #141a22 55%, #0a0c10 100%);
  /* keep border-color + color as today */
}
```

Slightly darken `.atmosphere-field` fill if contrast drops (`rgba(0,0,0,0.36)`).

- [ ] **Step 4: Run `npx vitest run tests/atmosphere-tokens.test.ts`** — PASS

- [ ] **Step 5: Commit** (if requested)

```bash
git commit -m "$(cat <<'EOF'
style: deepen static atmosphere canvas for form shells

EOF
)"
```

---

### Task 4: Meetup copy — CTA, status, errors

**Files:**
- Modify: `src/components/plan/PublicPlanContent.tsx`
- Modify: `src/lib/ui/api-error-message.ts`
- Modify: `src/app/create/page.tsx` (footer)
- Modify: `src/app/p/[code]/manage/page.tsx`
- Modify: `src/app/p/[code]/result/page.tsx` (empty/incomplete notices)
- Modify: `tests/public-plan-content.test.ts`
- Add/Modify: `tests/api-error-message.test.ts` (create if missing)

**Interfaces:**
- Consumes: existing `getApiErrorMessage`
- Produces: exact Chinese strings from the spec §2 table

- [ ] **Step 1: Update failing assertions first**

In `tests/public-plan-content.test.ts` replace calculator strings:

| Old | New |
| --- | --- |
| `还差 1 位朋友。人齐之后，填过的人都能发起计算。` | `还差 1 位朋友。人齐之后，填过的人都能点「开始见面」。` |
| `位朋友都填好了，可以开始算这次去哪座城` | `人齐了！点一下，看看这次去哪座城见。` |
| `算出见面城市` | `开始见面` |

Add:

```ts
expect(html).not.toContain("计算");
expect(html).not.toContain("开算");
expect(html).not.toContain("算出见面城市");
```

Only on the full-participants CTA case (progress messages may still say「查…票」— that is fine; do **not** ban the character sequence inside progress if it never appears — the ban is for calculator framing words `计算`/`开算`). Prefer explicit positive asserts + `not.toContain("开算")` + `not.toContain("发起计算")` + `not.toContain("算出见面城市")` rather than blanket `not.toContain("计算")` if any trust string still needs 算.

For `REAL_QUOTE_COVERAGE_INCOMPLETE` also drop「再算一次」→ `有几位朋友的票价没查全，过一会再试一次`.

- [ ] **Step 2: Run `npx vitest run tests/public-plan-content.test.ts` — FAIL**

- [ ] **Step 3: Implement copy**

`PublicPlanContent.tsx`:
- Button: `calculating ? "见面安排中" : "开始见面"`
- Fallback errors: `这次没安排成，稍后再试一次` / keep opening result message without「计算」
- `resolveStatusMessage`:
  - `canCalculateHere` → `人齐了！点一下，看看这次去哪座城见。`
  - `participantsFull` → `人齐了，等一位填过资料的朋友来点「开始见面」。`
  - else → `还差 ${missingParticipants} 位朋友。人齐之后，填过的人都能点「开始见面」。`

`api-error-message.ts` — apply spec table exactly.

Create footer / manage / result notices — apply spec §2.

- [ ] **Step 4: Run related tests**

Run: `npx vitest run tests/public-plan-content.test.ts tests/create-plan-page.test.ts tests/home-page.test.ts`
Expected: PASS (update create source assert if it locks old footer)

- [ ] **Step 5: Commit** (if requested)

```bash
git commit -m "$(cat <<'EOF'
copy: replace calculator CTAs with 开始见面 language

EOF
)"
```

---

### Task 5: Merge local + Amap city search + combobox empty state

**Files:**
- Modify: `src/lib/city/city-provider.ts`
- Modify: `src/components/forms/CityCombobox.tsx`
- Modify: `tests/provider-shells.test.ts`
- Add: `tests/city-combobox.test.ts` (source or lightweight render)

**Interfaces:**
- Consumes: `searchLocalCities`, `searchAmapCities`
- Produces: `searchCities(query)` returns up to 8 merged `CitySearchResult` (local first)

- [ ] **Step 1: Rewrite/extend search tests**

Replace “local hit means fetch not called” with:

```ts
it("merges Amap prefecture matches after local hubs for the same query", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "1",
          tips: [
            { name: "武汉市", district: "湖北省", adcode: "420100" },
            { name: "武威市", district: "甘肃省", adcode: "620600" },
          ],
        }),
        { status: 200 },
      ),
    ),
  );
  vi.stubEnv("AMAP_API_KEY", "test-key");

  const cities = await searchCities("武");
  expect(cities[0]).toEqual(expect.objectContaining({ code: "wuhan", name: "武汉" }));
  expect(cities.map((c) => c.code)).toContain("amap-620600");
  expect(fetch).toHaveBeenCalled();
});
```

Keep Zhanjiang-only and failure cases. When Amap fails but local hits, still return local.

- [ ] **Step 2: Run — FAIL on old short-circuit behavior**

- [ ] **Step 3: Implement merge in `searchCities`**

Algorithm:
1. `local = searchLocalCities(query)` → map to `{code,name,province}`
2. `seen = Set(local codes)` (+ optional normalized names)
3. If no `AMAP_API_KEY`, return `local.slice(0, 8)`
4. Else fetch Amap tips; for each tip reuse existing normalize + hub remap + `amap-<adcode>` prefecture rules; append if not seen
5. Return `merged.slice(0, 8)`

`CityCombobox.tsx`:
- `placeholder` default: `输入城市名，如 北京 / 湛江`
- Track `searchedEmpty`: query trimmed non-empty, fetch settled, `results.length === 0`
- Show muted hint: `没找到这个市，试试完整市名，如「湛江」`

- [ ] **Step 4: Run `npx vitest run tests/provider-shells.test.ts tests/city-combobox.test.ts`**

- [ ] **Step 5: Commit** (if requested)

```bash
git commit -m "$(cat <<'EOF'
feat: merge Amap prefecture cities into departure search

EOF
)"
```

---

### Task 6: Create participant dropdown opens upward

**Files:**
- Modify: `src/app/create/page.tsx`
- Modify: `tests/create-plan-page.test.ts`

**Interfaces:**
- No new exports

- [ ] **Step 1: Failing source test**

```ts
expect(pageSource).toContain("bottom-full");
expect(pageSource).not.toContain("mt-2 w-full overflow-hidden rounded-lg p-1");
// or assert the options className includes bottom-full and mb-2
```

Optional: assert `onKeyDown` / Escape handler string present.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Change options panel classes from downward (`mt-2`) to upward:

```tsx
className="atmosphere-panel absolute bottom-full z-10 mb-2 w-full overflow-hidden rounded-lg p-1"
```

Add `useEffect` for outside click + Escape to set `participantLimitOpen` false (panel open only).

- [ ] **Step 4: Run `npx vitest run tests/create-plan-page.test.ts`** — PASS

- [ ] **Step 5: Commit** (if requested)

```bash
git commit -m "$(cat <<'EOF'
fix: open participant limit menu above the create CTA

EOF
)"
```

---

### Task 7: Authority docs sync + full verification

**Files:**
- Modify: `AGENTS.md` — scenic rules: create/join no video; plan/result/records light shell video; CTA「开始见面」
- Modify: `docs/superpowers/specs/2026-07-17-ui-copy-and-visual-direction.md` — phase note + redline update
- Modify: `docs/architecture.md` — shell scenic + scene preference + city merge one-liners
- Modify: `docs/superpowers/specs/2026-07-18-inner-atmosphere-meetup-copy-design.md` — Status → **Shipped** + date when done
- Modify: `docs/superpowers/README.md` — item 5 mark shipped
- Modify: `.superpowers/sdd/progress.md` — brief ledger line if that file tracks UI passes

- [ ] **Step 1: Apply doc edits** matching shipped behavior (no “next / later” dual wording)

- [ ] **Step 2: Full verify**

```bash
npm run lint
npm run test
npm run build
```

Expected: all green

- [ ] **Step 3: Manual smoke**

- Desktop + phone: `/` switch scene → `/create` (static, richer) → `/records` (light video matches scene) → open plan shell
- Create: open participant menu — CTA still visible
- Join: search `湛江` — selectable when Amap configured
- Full plan: CTA shows「开始见面」

- [ ] **Step 4: Commit docs** (if requested)

```bash
git commit -m "$(cat <<'EOF'
docs: ship inner atmosphere and meetup copy contract

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Create/join static deepen, no looping video | 3, 2 (no `scenic` prop) |
| Plan/result/records light video + scrim | 2 |
| Home scene localStorage linkage | 1, 2 |
| reduced-motion / error fallback | 2 |
| CTA「开始见面」+ status/error copy | 4 |
| SAFE_EXPLANATIONS unchanged | 4 (explicit non-touch) |
| Merge departure search / hub candidates unchanged | 5 |
| Combobox empty hint + placeholder | 5 |
| Dropdown opens upward, CTA visible | 6 |
| Authority docs + lint/test/build | 7 |
| alternatives/manage deep IA untouched | 2/4 (only manage helper string) |

## Plan self-review notes

- No TBD placeholders.
- PeakScenicAccent test rewritten so shell video is allowed without putting video behind create/join forms.
- `searchCities` merge intentionally changes the old “local short-circuit skips Amap” contract; tests updated in Task 5.
- Blanket `not.toContain("计算")` avoided in favor of banning calculator CTA phrases so trust progress copy can keep「查票」language.
`