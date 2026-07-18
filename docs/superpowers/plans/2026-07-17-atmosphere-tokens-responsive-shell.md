# Atmosphere Tokens → ResponsiveShell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make create / join / public plan (and all `ResponsiveShell` routes) share the home page’s black phone canvas, cold scenic atmosphere, glass panels, and type stacks — without looping scenic video on form pages.

**Architecture:** Add CSS variables and `.atmosphere-*` utility classes in `globals.css`. Restyle `ResponsiveShell` to consume them. Swap white cards / black CTAs on create, join form, plan content, and dark-context form controls to the shared atmosphere classes.

**Tech Stack:** Next.js App Router, React, Tailwind v4 (`@import "tailwindcss"`), Vitest + `renderToStaticMarkup` for component markup contracts.

## Global Constraints

- No looping scenic video behind create / join / plan forms (AGENTS.md + visual direction spec).
- User-facing copy stays Chinese; do not rewrite copy in this pass.
- Do not change publication guards, host-token rules, or recommendation logic.
- Phase 3 plan/result IA is out of scope; result pages only inherit the dark shell.
- Do not commit unless the user explicitly asks.
- Before claiming done: `npm run lint`, `npm run test`, `npm run build`.

---

## File map

| File | Responsibility |
| --- | --- |
| `src/app/globals.css` | Atmosphere CSS variables + `.atmosphere-*` classes; keep existing hero classes |
| `src/components/layout/ResponsiveShell.tsx` | Dark shell frame, serif title, glass back, muted footer |
| `src/app/create/page.tsx` | Atmosphere panels / fields / CTA |
| `src/components/plan/JoinParticipantForm.tsx` | Atmosphere panel / fields / CTA / ghost |
| `src/components/plan/PublicPlanContent.tsx` | Atmosphere panels + CTA / ghost buttons; text ink colors |
| `src/components/plan/ParticipantList.tsx` | Dark-readable participant rows |
| `src/components/ui/Notice.tsx` | Dark-readable notice (used inside plan panels) |
| `src/components/forms/CityCombobox.tsx` | Optional `tone="atmosphere"` field + dropdown |
| `src/components/forms/TransportModePicker.tsx` | Optional `tone="atmosphere"` chips |
| `tests/responsive-shell.test.ts` | Assert atmosphere shell markers |
| `tests/atmosphere-tokens.test.ts` | Assert globals define required tokens/classes |
| Spec already updated | `docs/superpowers/specs/2026-07-17-ui-copy-and-visual-direction.md` |

---

### Task 1: Atmosphere CSS tokens + shell contract test

**Files:**
- Modify: `src/app/globals.css`
- Modify: `tests/responsive-shell.test.ts`
- Create: `tests/atmosphere-tokens.test.ts`

**Interfaces:**
- Produces CSS classes: `atmosphere-shell`, `atmosphere-canvas`, `atmosphere-panel`, `atmosphere-field`, `atmosphere-cta`, `atmosphere-ghost`, `atmosphere-notice`, `font-display`, `font-sans-sc`
- Produces CSS variables: `--atmosphere-canvas` (via gradient utility), `--atmosphere-ink`, `--atmosphere-muted`, `--atmosphere-line`, `--app-font-display`, `--app-font-sans-sc`

- [ ] **Step 1: Write failing token + shell tests**

`tests/atmosphere-tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("atmosphere design tokens", () => {
  it("defines shared shell/panel/field/cta classes in globals.css", () => {
    const css = readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    for (const token of [
      "--atmosphere-ink",
      "--atmosphere-muted",
      "--atmosphere-line",
      "--app-font-display",
      "--app-font-sans-sc",
      ".atmosphere-shell",
      ".atmosphere-canvas",
      ".atmosphere-panel",
      ".atmosphere-field",
      ".atmosphere-cta",
      ".atmosphere-ghost",
      ".atmosphere-notice",
      ".font-display",
      ".font-sans-sc",
    ]) {
      expect(css).toContain(token);
    }

    expect(css).toContain("#3a4a5c");
    expect(css).toContain("#0a0c10");
  });
});
```

Update `tests/responsive-shell.test.ts` expectations to also require:

```ts
expect(html).toContain("atmosphere-shell");
expect(html).toContain("atmosphere-canvas");
expect(html).toContain("font-display");
expect(html).not.toContain("bg-slate-100");
expect(html).not.toContain("bg-white shadow-sm");
```

Keep existing H5 canvas assertions (`max-w-md`, `h-svh`, back link, etc.).

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/atmosphere-tokens.test.ts tests/responsive-shell.test.ts`

Expected: atmosphere-tokens FAIL (classes missing); responsive-shell FAIL (`atmosphere-shell` missing).

- [ ] **Step 3: Add CSS tokens to `globals.css`**

Append after existing hero block (keep `.hero-cta` / `.scenic-fallback` intact). Exact values:

```css
:root {
  /* extend existing :root — merge, do not duplicate the whole block */
  --atmosphere-ink: rgba(255, 255, 255, 0.96);
  --atmosphere-muted: rgba(255, 255, 255, 0.68);
  --atmosphere-line: rgba(255, 255, 255, 0.16);
  --app-font-display: "Noto Serif SC", "Instrument Serif", serif;
  --app-font-sans-sc: "PingFang SC", "Noto Sans SC", system-ui, sans-serif;
}

.font-display {
  font-family: var(--app-font-display);
}

.font-sans-sc {
  font-family: var(--app-font-sans-sc);
}

.atmosphere-shell {
  background: #000;
  color: var(--atmosphere-ink);
}

.atmosphere-canvas {
  background:
    radial-gradient(ellipse at 50% 28%, #3a4a5c 0%, #1a222c 52%, #0a0c10 100%);
  border-color: rgba(255, 255, 255, 0.1);
  color: var(--atmosphere-ink);
}

.atmosphere-panel {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--atmosphere-line);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 12px 32px rgba(0, 0, 0, 0.28);
  color: var(--atmosphere-ink);
}

.atmosphere-field {
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--atmosphere-line);
  color: var(--atmosphere-ink);
}

.atmosphere-field::placeholder {
  color: rgba(255, 255, 255, 0.42);
}

.atmosphere-cta {
  background: rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.38);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 10px 28px rgba(0, 0, 0, 0.22);
  color: #fff;
}

.atmosphere-cta:hover {
  background: rgba(255, 255, 255, 0.24);
}

.atmosphere-cta:disabled {
  opacity: 0.6;
}

.atmosphere-ghost {
  background: transparent;
  border: 1px solid var(--atmosphere-line);
  color: var(--atmosphere-ink);
}

.atmosphere-ghost:hover {
  background: rgba(255, 255, 255, 0.08);
}

.atmosphere-notice {
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--atmosphere-line);
  color: var(--atmosphere-muted);
}
```

Also merge the five new `:root` variables into the existing `:root` block at the top of the file (do not leave a second conflicting `:root` that resets `--background`).

- [ ] **Step 4: Restyle `ResponsiveShell.tsx`**

Replace the component body with atmosphere shell (preserve props API):

```tsx
import type { ReactNode } from "react";
import Link from "next/link";

export function ResponsiveShell({
  title,
  description,
  children,
  aside,
  actions,
  backHref,
  backLabel = "返回上一页",
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <main className="atmosphere-shell flex min-h-svh items-center justify-center p-0 sm:p-6">
      <div className="atmosphere-canvas flex h-svh w-full max-w-md flex-col overflow-hidden sm:h-[min(860px,calc(100svh-3rem))] sm:rounded-3xl sm:border">
        <header className="shrink-0 border-b border-white/10 px-5 pb-4 pt-5">
          {backHref && (
            <Link
              aria-label={backLabel}
              className="atmosphere-ghost mb-3 inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-medium font-sans-sc"
              href={backHref}
            >
              <span aria-hidden="true">‹</span>
              <span>{backLabel}</span>
            </Link>
          )}
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--atmosphere-ink)]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 font-sans-sc text-sm leading-6 text-[var(--atmosphere-muted)]">
              {description}
            </p>
          )}
          {actions && <div className="mt-4">{actions}</div>}
        </header>

        <section className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-5 py-5 font-sans-sc">
          {children}
        </section>

        {aside && (
          <footer className="shrink-0 border-t border-white/10 px-5 py-4 text-[var(--atmosphere-muted)]">
            {aside}
          </footer>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Re-run tests — expect PASS**

Run: `npx vitest run tests/atmosphere-tokens.test.ts tests/responsive-shell.test.ts`

Expected: PASS.

---

### Task 2: Create + join form surfaces

**Files:**
- Modify: `src/app/create/page.tsx`
- Modify: `src/components/plan/JoinParticipantForm.tsx`
- Modify: `src/components/forms/CityCombobox.tsx`
- Modify: `src/components/forms/TransportModePicker.tsx`
- Test: existing `tests/create-page.test.ts`, `tests/join-form.test.ts` (copy assertions must still pass)

**Interfaces:**
- Consumes: `.atmosphere-panel`, `.atmosphere-field`, `.atmosphere-cta`, `.atmosphere-ghost`
- `CityCombobox` / `TransportModePicker` gain optional `tone?: "default" | "atmosphere"` (default `"atmosphere"` only where join uses them; prefer defaulting to `"atmosphere"` if all current call sites are join/create dark shell — check call sites; if home or light surfaces use them, keep default `"default"` and pass `tone="atmosphere"` from join)

- [ ] **Step 1: Grep call sites**

Run: `rg "CityCombobox|TransportModePicker" src -n`

If only join/plan dark contexts: default `tone="atmosphere"`. If mixed: keep `default` and pass from `JoinParticipantForm`.

- [ ] **Step 2: Update form controls**

`CityCombobox`: when `tone === "atmosphere"`, input uses `atmosphere-field rounded-lg px-4 py-3`; dropdown uses `atmosphere-panel` (not `bg-white`); option hover `hover:bg-white/10`.

`TransportModePicker`: atmosphere selected = `border-white/50 bg-white/20 text-white`; unselected = `atmosphere-ghost text-[var(--atmosphere-muted)]`.

- [ ] **Step 3: Restyle create page + join form**

Create form container: `space-y-3 atmosphere-panel rounded-xl p-4`  
Inputs/buttons: `atmosphere-field` / `atmosphere-cta rounded-xl`  
Labels: `text-[var(--atmosphere-muted)]`  
Error: keep readable — e.g. `rounded-lg border border-red-300/40 bg-red-500/15 px-3 py-2 text-sm text-red-100`  
Success sections: same panel/field/cta pattern; aside footer text can stay as-is (inherits muted from shell).

Join form: same panel/field/cta/ghost pattern; message box uses `atmosphere-notice`.

- [ ] **Step 4: Run create + join tests**

Run: `npx vitest run tests/create-page.test.ts tests/join-form.test.ts`

Expected: PASS (labels/copy unchanged).

---

### Task 3: Public plan panels + dark Notice / ParticipantList

**Files:**
- Modify: `src/components/plan/PublicPlanContent.tsx`
- Modify: `src/components/plan/ParticipantList.tsx`
- Modify: `src/components/ui/Notice.tsx`

**Interfaces:**
- Consumes atmosphere panel/cta/ghost/notice
- `Notice` becomes dark-readable via `.atmosphere-notice` (all current Notice usages are under ResponsiveShell / plan / result — acceptable for this phase)

- [ ] **Step 1: Restyle Notice + ParticipantList**

```tsx
// Notice.tsx
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="atmosphere-notice rounded-lg px-3 py-2 text-sm leading-6">
      {children}
    </div>
  );
}
```

```tsx
// ParticipantList rows
className="rounded-lg border border-white/10 bg-black/20 p-3"
// name: text-[var(--atmosphere-ink)]
// meta: text-[var(--atmosphere-muted)]
```

- [ ] **Step 2: Restyle PublicPlanContent sections/buttons**

- Sections: `atmosphere-panel rounded-xl p-5`
- Headings: `font-medium text-[var(--atmosphere-ink)]`
- Primary links/buttons: `atmosphere-cta rounded-xl ...`
- Secondary links: `atmosphere-ghost rounded-xl ...`
- Disabled result placeholder: `atmosphere-ghost opacity-50 ...`
- Footer count line: `text-[var(--atmosphere-muted)]`
- Do **not** restructure “还差谁 / 人齐 / 出结果” IA (phase 3)

- [ ] **Step 3: Smoke related tests**

Run: `npx vitest run tests/public-plan-content.test.ts tests/responsive-shell.test.ts tests/atmosphere-tokens.test.ts tests/create-page.test.ts tests/join-form.test.ts`

If `public-plan-content` test file name differs, run: `npx vitest run tests | head` / `rg -l PublicPlanContent tests`

Expected: PASS for touched suites.

---

### Task 4: Full verification + docs touch-up

**Files:**
- Modify if needed: `docs/superpowers/specs/2026-07-17-ui-copy-and-visual-direction.md` (mark phase 2 implementation shipped when done)
- Optional: `HomeHero.tsx` — replace inline `sans`/`display` objects with `font-sans-sc` / `font-display` classes (no visual change)

- [ ] **Step 1: Lint / test / build**

```bash
npm run lint
npm run test
npm run build
```

Expected: all pass.

- [ ] **Step 2: Mark phase 2 shipped in the visual-direction spec Status section**

Change phase 2 status line to shipped once verification passes.

- [ ] **Step 3: Do not commit unless user asks**

---

## Spec coverage check

| Spec requirement | Task |
| --- | --- |
| Atmosphere CSS variables + classes | Task 1 |
| ResponsiveShell dark frame | Task 1 |
| Create / join panels + fields + CTA | Task 2 |
| CityCombobox / TransportModePicker dark readable | Task 2 |
| PublicPlanContent panels/buttons only | Task 3 |
| No video on forms | All tasks (no video added) |
| Result IA deferred | Task 3 explicitly avoids |
| lint / test / build | Task 4 |
