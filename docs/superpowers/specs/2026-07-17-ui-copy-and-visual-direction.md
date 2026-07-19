# UI Copy And Visual Direction (2026-07-17)

## Status

Approved product-facing direction for Chinese copy and home-hero visual language.

- Copy pass: shipped in product repo.
- Home hero visual (phase 1): ported from the external MeetpointPreview into product `/` (train-window hero, text-shadow readability, glass CTA → `/create`; no Lumora/preview chrome).
- Phase 2 (atmosphere tokens → ResponsiveShell / create / join / plan): **shipped**.
- Phase 3 (plan/result IA): **shipped** (StatusLane on public plan + glass schemes on shared result; see `2026-07-17-plan-result-ia-design.md`).
- Phase 4 (wait/reveal accent): **shipped, revised 2026-07-19** — calculation-wait (`RefreshingResultNotice` nonterminal) and city-reveal (`SharedRecommendation`) use transparent glass over the route-fixed scene; no nested scenic video.
- Adaptive shell (approved 2026-07-17): **shipped** — no fake H5 phone frame; true adaptive layout; home opening zero-scroll; 最近见面记录 on `/records` — see `2026-07-17-desktop-adaptive-shell-design.md`.
- Inner atmosphere continuity + meetup copy: **shipped** 2026-07-18, with 2026-07-19 smoke hardening — home continuously cycles all four clips; each functional route uses one root-mounted deterministic clip under the shared scrim; host CTA「开始见面」/「见面安排中」; departure prefecture search hardening; create participant menu expands inline without covering the CTA. Home hero brand mark: `meetpoint`. See `2026-07-18-inner-atmosphere-meetup-copy-design.md`. This **supersedes** older “plan/shell stay video-free”, “create/join static only”, and “算出见面城市” wording.
- Home readability follow-up (revised 2026-07-19): use stronger layered text shadows, a darker translucent hero CTA, and higher supporting-copy / inactive-scene opacity. Do not place a local or full-screen dark veil behind the copy; bounded overlays create visible blocks on bright moving scenery.
- Home hero headline punctuation follow-up (approved 2026-07-19): render「散在几座城的朋友」and「这次在哪儿见」as two clean lines without the comma or question mark.

## Copy principles

- Flow and marketing surfaces (home, create, join, wait-for-friends) speak as **friends about to meet**, not as a fare-lookup tool.
- Avoid primary CTA language that frames the product as a calculator (`开算`, `开始计算`, `算出见面城市`, `发起计算` as the hero/host action). Prefer meeting-outcome language (`发起见面计划`; host run CTA「开始见面」/「见面安排中」per `2026-07-18-inner-atmosphere-meetup-copy-design.md`).
- Result and progress surfaces stay trustworthy: real fares, no estimates, incomplete coverage does not publish. Translate engineering jargon for users (`供应商限流` → human wording; quote fingerprints stay folded under data-source disclosure).
- Prefer `朋友` over `全员` in user-facing prose when the audience is participants, not operators.
- Recommended Chinese explanations must stay inside `SAFE_EXPLANATIONS_ZH` in `src/lib/agent/prompts.ts`. Changing them requires updating the whitelist, model prompt example, fallback store, and agent tests together.

## Shipped in this pass (product repo)

- Home, create, join, public plan, progress, result shell, alternatives, and API error strings rewritten toward the tone above.
- `SAFE_EXPLANATIONS_ZH` updated to warmer but still fact-safe sentences.
- Scheme cards: optional short sublabels; quote evidence moved into a `<details>` “数据来源” disclosure.
- Browser tab title set to Chinese.

## Home hero visual direction

Product source of truth (phase 1 shipped 2026-07-17):

- `src/components/home/HomeHero.tsx` on product `/` (full-bleed train-window video + overlay, text-shadow readability, glass CTA → `/create`, “最近记录” → `/records`; opening viewport zero-scroll)
- Hero visual tokens live in `src/app/globals.css` (`.readable-title`, `.readable-body`, `.hero-cta`, `.hero-chip`, `.train-bob`, `.scenic-fallback`)

External preview (reference only; not the live product entry):

- Absolute path: `/Users/lixinyu/Desktop/meetpoint项目开头展示`
- Entry: `src/MeetpointPreview.tsx` (mounted by `src/main.tsx`; original Lumora `src/App.tsx` remains for reference)

Shared decisions:

- Metaphor: train window = on the way to meet friends
- Readability: use layered text-shadow only; do not add a bounded local veil or a full-screen dark scrim that interrupts or kills the scenery
- Primary CTA: dark semi-transparent glass pill, slightly shorter than full content column (`~18–19.5rem`), larger white label text; it must remain distinct on both snow-bright and forest-dark frames
- Supporting copy stays near-opaque white, and inactive scene labels remain at least `0.72` opacity so moving bright frames do not erase them
- Functional pages use one route-fixed muted looping clip under the readable shell scrim; only home cycles all four clips
- Phase 4: transparent scenic glass at emotional peaks (calculation wait, result reveal) via `PeakScenicAccent`; it reveals the route-fixed page scene.
- Route-fixed shell scenic mapping: create=静水, join=静水, plan=密林, result=破晓, records=破晓, alternatives=静水, manage=密林 (`2026-07-18-inner-atmosphere-meetup-copy-design.md`)

## Phase 4 — Wait / reveal scenic glass

**Status:** shipped 2026-07-17 in the product repo.

### Goal

Emphasize calculation-wait and result-reveal emotional peaks with a transparent glass container that keeps the route-fixed page scene visually continuous.

### Chosen approach

`PeakScenicAccent` wraps:

- Nonterminal wait UI in `RefreshingResultNotice` (not incomplete / failed diagnostics)
- City reveal panel in `SharedRecommendation` (scheme cards stay glass-only)

The container uses translucent glass, a subtle border, and backdrop blur. It mounts no `<video>` and no `.scenic-fallback`; the route-fixed shell scene is the only scenic source. No train-frame overlay and no scene switcher (home-only).

### Out of scope

- Video in `ResponsiveShell`, create, join, or public plan StatusLane
- Deep alternatives / manage IA restyle
- Changing publication / recommendation behavior

### Acceptance

- Wait (nonterminal) and shared city reveal show transparent scenic glass with no nested video; incomplete / failed do not use the peak container
- Create / join / plan / `ResponsiveShell` sources contain no peak video
- `npm run lint`, `npm run test`, and `npm run build` pass

## Shipped phases

1. ~~Port approved home hero into product `/` (Meetpoint copy + train/scenery; CTA → `/create`)~~ **done**
2. Extract design tokens into `ResponsiveShell` / globals so create/join/plan do not feel like a different product — **done (Approach A)**
3. ~~Interaction/IA pass on plan and result pages (less card stacking; clearer “who’s missing / ready / result”)~~ **done** (StatusLane + glass schemes; `2026-07-17-plan-result-ia-design.md`)
4. ~~Optional wait / reveal accent~~ **done, revised 2026-07-19** (`PeakScenicAccent` reveals the route-fixed scene without nested scenic media)
5. ~~Inner atmosphere continuity + meetup copy~~ **done** (home four-clip loop; functional route-fixed shell scenic;「开始见面」; departure search merge; upward participant menu — `2026-07-18-inner-atmosphere-meetup-copy-design.md`)

## Phase 2 — Shared atmosphere tokens (Approach A)

**Status:** shipped 2026-07-17 in the product repo.

### Goal

Create / join / public plan (and any other `ResponsiveShell` route) should feel like the same product as `/`: full-bleed dark scenic canvas, cold gray atmosphere, glass panels and CTAs, shared type stacks. The original phase-2 static-only form constraint is superseded by the 2026-07-18 route-fixed scenic follow-up.

### Chosen approach

Single skin via CSS variables + utility classes in `globals.css`, applied by `ResponsiveShell` and form/plan panels. Rejected: dual `AtmosphereShell` variant (fork risk) and per-page hand-copied Tailwind (no shared tokens).

### Atmosphere direction

Deep train-window continuation (not a light mist shell):

- Outer shell: black / scenic canvas matching home (adaptive width; no fake phone chrome)
- Canvas: radial cool-gray gradient from `.scenic-fallback` palette (`#3a4a5c` → `#1a222c` → `#0a0c10`)
- Content: translucent glass panels, not flat white cards
- Type: display serif for titles; sans for body/controls; light ink on dark canvas
- Primary CTA: same glass language as `.hero-cta` (usable as full-width form buttons; pill radius may be `rounded-xl` / `rounded-2xl` for forms vs hero pill)

### Tokens / classes (`src/app/globals.css`)

| Name | Role |
| --- | --- |
| `--atmosphere-ink` / `--atmosphere-muted` / `--atmosphere-line` | Primary text, secondary text, hairline borders on dark canvas |
| `--app-font-display` / `--app-font-sans-sc` | Noto Serif SC + PingFang / Noto Sans SC stacks |
| `.atmosphere-shell` | Outer black scenic shell (adaptive; no fake phone chrome) |
| `.atmosphere-canvas` | Shell interior: radial cool-gray gradient (`#3a4a5c` → `#1a222c` → `#0a0c10`) |
| `.atmosphere-panel` | Glass content container (form / plan sections) |
| `.atmosphere-field` | Inputs / selects: translucent dark fill, light text, light border (`color-scheme: dark`) |
| `.atmosphere-cta` | Primary action (glass, aligned with `.hero-cta`) |
| `.atmosphere-ghost` | Secondary / back / outline actions |
| `.atmosphere-notice` | Inline notices on dark panels |
| `.font-display` / `.font-sans-sc` | Shared type utilities (also used by `HomeHero`) |
| Existing hero classes | Keep `.readable-*`, `.hero-cta`, `.scenic-fallback` for home |

### Component scope

**Must change in this phase**

- `src/components/layout/ResponsiveShell.tsx` — consume atmosphere shell/header/footer/back control
- `src/app/create/page.tsx` — panels, fields, primary CTA
- `src/components/plan/JoinParticipantForm.tsx` — panel, fields, CTA, ghost link
- `src/components/plan/PublicPlanContent.tsx` — section panels and primary/secondary buttons only (no IA restructure)
- Form controls used on join: `CityCombobox`, `TransportModePicker` — readable on dark glass (variant prop or shared field classes)

**Shell-only (no deep restyle of result IA)**

- Result / alternatives / manage pages keep current inner structure; they inherit the dark shell automatically
- Scheme cards and “还差谁 / 人齐 / 出结果” clarity deferred to phase 3 (shipped; see `2026-07-17-plan-result-ia-design.md`)

**Out of scope**

- Looping video on create/join/plan
- Copy rewrites
- Publication / host-token / recommendation logic
- Home hero behavior changes (optional: point HomeHero fonts at shared CSS variables without visual change)

### Acceptance

- Create, join, and public plan share black frame + cold atmosphere with `/`; no scenic video behind forms
- Inputs, date picker, combobox, mode chips, and primary CTA remain readable and tappable on dark glass
- `npm run lint`, `npm run test`, and `npm run build` pass

## Non-goals

- Replacing publication guards, quote verification, or host-token confirmation rules
- Running cinematic video on every screen
- Editing historical `docs/superpowers/plans/*` checklists to rewrite old copy examples
- Phase-3 plan/result information architecture inside this atmosphere pass
