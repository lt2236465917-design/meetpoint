# Inner Atmosphere Continuity + Meetup Copy (2026-07-18)

## Status

**Shipped** 2026-07-18 (conversation design + Subagent-Driven Tasks 1–7).

Extends `2026-07-17-ui-copy-and-visual-direction.md` and `2026-07-17-desktop-adaptive-shell-design.md`. Does **not** reopen alternatives / manage IA.

## Problem

1. Home feels cinematic (train-window video); create / join / plan / result / records drop to a flat static gradient — product continuity breaks.
2. Host CTA and nearby copy still expose「计算 / 开算 / 算出见面城市」, which feels like a fare calculator.
3. Departure city search often feels limited to ~24 hubs because local hits short-circuit before Amap prefecture results.
4. Create-page participant-limit dropdown opens downward and covers「生成邀请链接」.

## Goals

- Keep one scenic memory from home into non-form product pages without hurting form readability.
- Primary actions speak as friends starting a meetup, not as a calculation tool.
- Departure cities: searchable China prefecture-level set; meeting **candidates** stay the hub library.
- Create-page participant picker never obscures the primary CTA.

## Non-goals

- Deep alternatives / manage restyle.
- Expanding meeting-candidate generation to all prefecture cities.
- Shipping a full offline gazetteer of 300+ cities in the client bundle.
- Changing `SAFE_EXPLANATIONS_ZH` whitelist text (recommendation explanation contract stays).
- Reintroducing fake phone frames or calculator-primary CTAs on marketing surfaces.

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| Atmosphere package | Approach 2 — continuity shell + copy + cities + dropdown |
| Light video surfaces | Plan / result / records only |
| Form surfaces | Create / join — static depth only (no looping video) |
| Scene linkage | Follow home scene via `localStorage` |
| Host primary CTA | 「开始见面」 |
| City coverage | Departure searchable prefectures; meeting candidates = hubs |
| Participant dropdown | Custom listbox opens **upward** |

---

## §1 Atmosphere and shell

### Create / join (static deepen)

- No looping scenic video behind forms (readability first).
- Strengthen `.atmosphere-canvas` (and related tokens): multi-stop radial light closer to home color temperature, optional very subtle texture, slightly stronger glass contrast, darker field fills.
- Still full adaptive `ResponsiveShell` / join layout — no train-frame overlay, no scene switcher.

### Plan / result / records (light dynamic)

- `ResponsiveShell` gains an optional full-bleed scenic layer using `SCENIC_VIDEOS`.
- Target media opacity about **0.22–0.32**, with a stronger dark gradient scrim above the video so titles, StatusLane, and CTAs stay readable.
- No train-window chrome; no in-shell scene switcher (switching remains home-only).
- `prefers-reduced-motion: reduce` → static deepened canvas (same as create/join family).
- Video error / blocked autoplay → scenic gradient fallback; never blank/white.

### Scene memory

- Home scene changes persist to `localStorage` key `meetpoint:scenic-scene` (store stable scene id / index aligned with `SCENIC_VIDEOS`).
- Plan / result / records read the same key; missing → default first home scene（金色黄昏）.
- Peak wait/reveal `PeakScenicAccent` remains for emotional peaks; shell light video provides page-level continuity. They do not replace each other.

### Spec redline update

| Before | After |
| --- | --- |
| Inner form/plan shells: no scenic video | **Create / join:** no looping video. **Plan / result / records:** allow muted low-opacity looping video under a dark scrim |

Authority docs (`AGENTS.md`, `2026-07-17-ui-copy-and-visual-direction.md`, `docs/architecture.md`, `docs/superpowers/README.md`) match this shipped redline.

---

## §2 Copy — hide calculator framing

### Primary CTA (`PublicPlanContent`)

| State | Copy |
| --- | --- |
| Idle, actionable | `开始见面` |
| In flight | `见面安排中` |

### Status lines (plan)

| State | Copy |
| --- | --- |
| Ready + local participant can act | `人齐了！点一下，看看这次去哪座城见。` |
| Full but device has no participant token | `人齐了，等一位填过资料的朋友来点「开始见面」。` |
| Not full | `还差 N 位朋友。人齐之后，填过的人都能点「开始见面」。` |

### Create footer

- `建好后把链接发到群里，人到齐就能开始见面。`

### User-visible API / result strings

| Code / surface | Copy |
| --- | --- |
| `INVALID_PARTICIPANT_TOKEN` | `先加入这场见面，才能开始哦` |
| `PARTICIPANT_LIMIT_NOT_REACHED` | `人数填满后才能开始见面` |
| `CALCULATION_FAILED` / client fallback | `这次没安排成，稍后再试一次` |
| `CALCULATION_IN_PROGRESS` | `正在替大家查真实车票和机票，页面稍后会自己更新` |
| `NOT_ENOUGH_PARTICIPANTS` | `至少需要 2 个人填写后才能开始` |
| `AGENT_PROPOSAL_INVALID` / `PUBLICATION_GUARD_REJECTED` | `方案没通过对大家更公平的核对，请再点一次「开始见面」` |
| `RUN_NOT_FOUND` / empty result notice | `还没有见面结果` |
| Incomplete result notice | `结果不完整，请回计划页再点一次「开始见面」` |
| Manage page helper | Participants who already filled in may tap「开始见面」on the plan page when the limit is full |

### Keep (trust language, not calculator CTAs)

- Progress lines about real tickets / fair city (`getRunProgressMessage` family).
- Result disclosures about verified fares / no estimates.
- Exact `SAFE_EXPLANATIONS_ZH` members unchanged.

### Tests

- Assert host CTA and plan status copy do **not** contain `计算`, `开算`, or `算出见面城市`.
- Keep / extend regressions that forbid legacy「一键开算」marketing framing.
- Update string assertions in create / plan / api-error / result tests together with the UI.

---

## §3 Cities and participant dropdown

### Departure city search

- Change `searchCities` to **merge** local hub matches with Amap prefecture-level matches (local first, dedupe by code/name), instead of returning early when local length > 0.
- Keep Amap filters: prefecture/municipality adcodes only; non-city tips rejected.
- Meeting candidate generation, distance, and hub library remain built-in `CITIES` only — Amap codes are valid **departure** selections, not automatic meeting candidates.
- `CityCombobox`: when query is non-empty and results are empty, show  
  `没找到这个市，试试完整市名，如「湛江」`.
- Placeholder: `输入城市名，如 北京 / 湛江`.
- Do not ship a full offline prefecture list; search + `AMAP_API_KEY` remain the coverage path. Operator docs already mention the key — note that departure coverage beyond hubs depends on it.

### Participant limit dropdown (create)

- Keep custom atmosphere listbox (not native `<select>`).
- Open panel **upward** (`bottom-full` / above the trigger) so it never covers「生成邀请链接」。
- Close on select; close on outside click; `Escape` when cheap to add.
- Acceptance: with the menu open, the generate-link button remains fully visible and clickable.

---

## Implementation touchpoints (indicative)

- `src/components/layout/ResponsiveShell.tsx` — optional scenic layer for plan/result/records callers (or a prop / route-aware wrapper).
- `src/components/home/HomeHero.tsx` + small `src/lib/ui/scenic-preference.ts` — persist/read scene.
- `src/app/globals.css` — deepened canvas; shell scenic media/scrim classes.
- `src/components/plan/PublicPlanContent.tsx`, `src/app/create/page.tsx`, `src/lib/ui/api-error-message.ts`, manage/result notices — copy.
- `src/lib/city/city-provider.ts`, `CityCombobox.tsx` — merge search + empty hint.
- Tests: atmosphere tokens, home preference, responsive shell, public-plan-content, create-plan-page, provider-shells / city search, api-error messages.
- Docs: this spec; sync `AGENTS.md` + visual-direction + architecture on ship.

## Acceptance

- [ ] Create / join: no looping video; visibly richer static atmosphere than pre-change flat gradient.
- [ ] Plan / result / records: light muted looping video under scrim; follows home scene; reduced-motion and error fallbacks work.
- [ ] Host CTA shows「开始见面」/「见面安排中」; user-facing plan/create/error strings above have no calculator framing.
- [ ] Searching a non-hub prefecture (e.g. 湛江) returns a selectable city when Amap is configured; hub meeting-candidate rules unchanged.
- [ ] Create participant menu opens upward and does not cover「生成邀请链接」.
- [ ] `npm run lint`, `npm run test`, `npm run build` pass.
- [ ] Alternatives / manage IA untouched beyond unavoidable shared string/token reuse.

## Out of scope / later backlog

- Broader plan/result motion redesign.
- Full prefecture meeting-candidate matrix.
- Dual desktop/H5 codebases.
- Rotating or expanding scenic clip catalog beyond existing `SCENIC_VIDEOS`.
`