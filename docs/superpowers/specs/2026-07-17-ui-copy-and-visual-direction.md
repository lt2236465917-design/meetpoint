# UI Copy And Visual Direction (2026-07-17)

## Status

Approved product-facing direction for Chinese copy and home-hero visual language.

- Copy pass: shipped in product repo.
- Home hero visual (phase 1): ported from the external MeetpointPreview into product `/` (train-window hero, text-shadow readability, glass CTA → `/create`; no Lumora/preview chrome).
- Phase 2 (atmosphere tokens → ResponsiveShell / create / join / plan): **shipped**.
- Phase 3 (plan/result IA): **shipped** (StatusLane on public plan + glass schemes on shared result; see `2026-07-17-plan-result-ia-design.md`).
- Phase 4 (optional wait/reveal video): **shipped** — light muted looping scenic video on calculation-wait (`RefreshingResultNotice` nonterminal) and city-reveal (`SharedRecommendation`); `prefers-reduced-motion` falls back to scenic gradient.
- Adaptive shell (approved 2026-07-17): **shipped** — no fake H5 phone frame; true adaptive layout; home opening zero-scroll; 最近见面记录 on `/records` — see `2026-07-17-desktop-adaptive-shell-design.md`.
- Inner atmosphere continuity + meetup copy: **shipped** 2026-07-18 — create/join static deepen (still no form video); plan/result/records muted shell scenic following home scene (`meetpoint:scenic-scene`); host CTA「开始见面」/「见面安排中」; departure prefecture search merge; create participant menu opens upward. See `2026-07-18-inner-atmosphere-meetup-copy-design.md`. This **supersedes** the older “plan/shell stay video-free” and “算出见面城市” host-CTA wording.

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
- Readability: prefer **text-shadow** over a full-screen dark scrim (scrim kills scenery)
- Primary CTA: semi-transparent glass pill, slightly shorter than full content column (`~18–19.5rem`), larger white label text
- Do **not** put looping scenic video behind **create/join** form pages; reuse tokens (type, glass, atmosphere) and static deepened canvas instead
- Phase 4: light scenic video at emotional peaks (calculation wait, result reveal) via `PeakScenicAccent` (shipped)
- Plan/result/records: muted full-shell scenic under a dark scrim (`2026-07-18-inner-atmosphere-meetup-copy-design.md`, shipped) — still never behind create/join forms

## Phase 4 — Wait / reveal light scenic video

**Status:** shipped 2026-07-17 in the product repo.

### Goal

Add a light train-window scenic accent only at calculation-wait and result-reveal emotional peaks, without putting looping video behind create / join / plan forms or deep-restyling alternatives / manage IA.

### Chosen approach

Shared catalog `src/lib/ui/scenic-videos.ts` (same CloudFront clips as `HomeHero`). New `PeakScenicAccent` wraps:

- Nonterminal wait UI in `RefreshingResultNotice` (not incomplete / failed diagnostics)
- City reveal panel in `SharedRecommendation` (scheme cards stay glass-only)

Single calm scene (`静水`), muted + loop + `playsInline`, soft opacity + gradient scrim for copy readability. CSS `.peak-scenic` / `.peak-scenic-media`; `prefers-reduced-motion: reduce` hides the `<video>` and keeps `.scenic-fallback`. No train-frame overlay, no multi-scene switcher (home-only).

### Out of scope

- Video in `ResponsiveShell`, create, join, or public plan StatusLane
- Deep alternatives / manage IA restyle
- Changing publication / recommendation behavior

### Acceptance

- Wait (nonterminal) and shared city reveal show light scenic video; incomplete / failed do not
- Create / join / plan / `ResponsiveShell` sources contain no peak video
- `npm run lint`, `npm run test`, and `npm run build` pass

## Shipped phases

1. ~~Port approved home hero into product `/` (Meetpoint copy + train/scenery; CTA → `/create`)~~ **done**
2. Extract design tokens into `ResponsiveShell` / globals so create/join/plan do not feel like a different product — **done (Approach A)**
3. ~~Interaction/IA pass on plan and result pages (less card stacking; clearer “who’s missing / ready / result”)~~ **done** (StatusLane + glass schemes; `2026-07-17-plan-result-ia-design.md`)
4. ~~Optional light video only on wait / reveal moments~~ **done** (`PeakScenicAccent` + shared `SCENIC_VIDEOS`; never behind create/join forms)
5. ~~Inner atmosphere continuity + meetup copy~~ **done** (plan/result/records shell scenic; create/join static deepen;「开始见面」; departure search merge; upward participant menu — `2026-07-18-inner-atmosphere-meetup-copy-design.md`)

## Phase 2 — Shared atmosphere tokens (Approach A)

**Status:** shipped 2026-07-17 in the product repo.

### Goal

Create / join / public plan (and any other `ResponsiveShell` route) should feel like the same product as `/`: full-bleed dark scenic canvas, cold gray atmosphere, glass panels and CTAs, shared type stacks. **No looping scenic video** on form-heavy pages.

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
