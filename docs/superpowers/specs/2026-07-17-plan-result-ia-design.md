# Plan And Result IA Design (2026-07-17)

## Status

**Shipped** 2026-07-17 in the product repo (plan StatusLane + glass shared-result schemes).

Approved design for UI visual phase 3 (plan + shared-result information architecture). Implementation follows this document and the parent visual direction in `2026-07-17-ui-copy-and-visual-direction.md`.

Parent choices locked in brainstorming:

- Plan page: single-column status narrative (Approach A / StatusLane)
- Result schemes: glass panels on dark atmosphere (Approach A)
- Scope: plan page + shared result core only (not deep alternatives / manage IA)
- Delivery intensity: StatusLane reorganization (Approach 1), not skin-only and not a full status-machine extract

## Goals

- One glance tells: who’s still missing / everyone ready / calculating / result ready
- Less card stacking on the public plan page
- Saving / fast scheme cards match the dark atmosphere shell
- No change to publication guards, host-token rules, quote facts, or Chinese copy tables

## Non-goals

- Looping scenic video on plan StatusLane (phase 4 ships wait/reveal accents elsewhere, not here)
- Rewriting `SAFE_EXPLANATIONS_ZH` or marketing copy tables
- Deep IA restyle of `/alternatives` or `/manage`
- Extracting a separate `PlanStatusView` state-machine module this round
- Recommendation / calculate / advance API behavior changes

## Plan page — StatusLane

Single `.atmosphere-panel` in `PublicPlanContent`, top to bottom:

### 1. Status band (single source of truth)

| Condition | Status copy direction |
| --- | --- |
| Under participant limit | `还差 N 位朋友` (keep warm friend tone; may keep the existing longer sentence that also says filled friends can start calculation once full) |
| Full, no run, local participant token | Ready-to-calculate message (existing “人齐了…” wording) |
| Full, no run, no local token | Wait for a filled friend to start calculation (existing wording) |
| Nonterminal run | Reuse `getRunProgressMessage(latestRun)` |
| `completed` | Ready to view city (e.g. `选好了，去看见面城市`) |

Do **not** repeat the same status in a footer line or a second Notice block.

### 2. Primary actions (state-driven; one primary CTA)

| Condition | Primary | Secondary |
| --- | --- | --- |
| Under limit | `加入这场见面` → `/join` | No fake “看结果” link |
| Full + can calculate | `算出见面城市` (existing calculate POST) | Optional ghost join only if still useful; hide join when already at limit |
| Nonterminal run | Progress copy only; no result link | — |
| `completed` | `看结果` → `/result` | Ghost `换个城市看看` → `/alternatives` (behavior unchanged) |

While calculating, do not render a disabled “看结果” / “暂无结果” twin button that competes with the status band.

### 3. Participant list

Same panel, lighter list (keep `ParticipantList` row treatment). Section title toward “已填写” / “已到场”; empty state keeps “还没有人填，把链接发到群里吧。”

### Unchanged behavior

- `x-participant-token` gating for calculate
- Background refresh / Fibonacci backoff while nonterminal
- Redirect to `/p/{code}/result` after successful calculate
- Meeting-history remember on view

## Shared result — glass schemes

### City reveal (`SharedRecommendation`)

Keep city name + `explanationZh`. Restyle the hero block onto `.atmosphere-panel` / atmosphere ink tokens; drop the hard `bg-gray-950` slab so it matches the shell.

### Scheme cards (`SchemeCard`)

- Outer: `.atmosphere-panel` (glass, not white card)
- Header: saving/fast title + short sublabel + team total fare
- Summary chips (duration / transfers): translucent inset, not `bg-gray-50`
- Per-participant routes: no nested white cards; hairline / `border-white/10` separators
- Keep `<details>` “数据来源” disclosure with muted text
- Do not reselect routes client-side; render persisted scheme routes only

### Progress (`RefreshingResultNotice`)

Align Notice / refresh button / diagnostic id with atmosphere (ghost or CTA button classes, muted diagnostic). Do not change advance / poll logic.

## Files

| File | Change |
| --- | --- |
| `src/components/plan/PublicPlanContent.tsx` | StatusLane single panel |
| `src/components/result/SharedRecommendation.tsx` | Atmosphere city reveal |
| `src/components/result/SchemeCard.tsx` | Glass scheme + route separators |
| `src/components/result/RefreshingResultNotice.tsx` | Atmosphere progress chrome |
| `src/app/globals.css` | Only if a missing shared utility is required |
| `tests/public-plan-content.test.ts` | Assert new status path / single-panel structure |
| `tests/shared-recommendation.test.ts` | Keep content assertions; optionally assert no white-card chrome |
| `docs/superpowers/specs/2026-07-17-ui-copy-and-visual-direction.md` | Phase 3 marked shipped (done 2026-07-17) |

## Acceptance

- Public plan: one primary panel; status path readable without footer duplication
- No result link before `completed`; no scheme cards on plan while nonterminal
- Scheme cards readable on dark shell; no white nested route cards
- `npm run lint`, `npm run test`, `npm run build` pass
- Alternatives / manage inherit shell only; no deep IA pass in this phase
