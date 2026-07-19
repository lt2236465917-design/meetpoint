# Inner Atmosphere Continuity + Meetup Copy (2026-07-18)

## Status

**Shipped** 2026-07-18 (conversation design + Subagent-Driven Tasks 1–7).

Post-ship smoke hardening (2026-07-18/19): home brand mark `meetpoint`; hydrate-safe scenic preference (no `useState(localStorage)`); any-scene ready on remount; decorative videos `pointer-events: none` so records/plan CTAs click once. Functional scenic media lives in the shared root layout, not inside each page, so same-scene navigation and result refresh preserve the video element and playback position. A defensive per-scene playback checkpoint restores progress after unavoidable remounts.

Records navigation feedback (2026-07-18): clicking「查看」must immediately show「正在打开…」while the dynamic plan route resolves, and the plan segment provides a visible loading shell. Repeated clicks are unnecessary; browser translation overlays remain external to the app and should be disabled for localhost when they cover controls.

Approved follow-up (2026-07-18): home keeps all four `SCENIC_VIDEOS` in continuous sequence plus manual selection. Every functional route uses exactly one deterministic looping clip under the shared shell scrim: create=静水, join=静水, plan=密林, result=破晓, records=破晓, alternatives=静水, manage=密林. Functional routes do not inherit or cycle the home selection. This background-only change does not reopen alternatives/manage IA.

Extends `2026-07-17-ui-copy-and-visual-direction.md` and `2026-07-17-desktop-adaptive-shell-design.md`. Does **not** reopen alternatives / manage IA.

## Problem

1. Home feels cinematic (train-window video); create / join / plan / result / records drop to a flat static gradient — product continuity breaks.
2. Host CTA and nearby copy still expose「计算 / 开算 / 算出见面城市」, which feels like a fare calculator.
3. Departure city search often feels limited to ~24 hubs because local hits short-circuit before Amap prefecture results.
4. Create-page participant-limit dropdown must not cover「生成邀请链接」.

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
| Home video | All four clips continuously cycle; manual selection remains |
| Functional surfaces | One route-fixed muted looping clip; never cycle all four |
| Scene linkage | Fixed mapping by functional route |
| Host primary CTA | 「开始见面」 |
| City coverage | Departure searchable prefectures; meeting candidates = hubs |
| Participant dropdown | Custom inline listbox expands below the trigger and pushes the CTA down |

---

## §1 Atmosphere and shell

### Create / join (fixed scenic)

- One muted looping scenic video behind the shared readable scrim: create=静水, join=静水.
- Strengthen `.atmosphere-canvas` (and related tokens): multi-stop radial light closer to home color temperature, optional very subtle texture, slightly stronger glass contrast, darker field fills.
- Still full adaptive `ResponsiveShell` / join layout — no train-frame overlay, no scene switcher.

### Functional route scenic mapping

- A root-mounted functional scenic layer derives the fixed scene from the pathname and renders one full-bleed looping clip from `SCENIC_VIDEOS`; `ResponsiveShell` only renders readable page content above it.
- Mapping: create=静水, join=静水, plan=密林, result=破晓, records=破晓, alternatives=静水, manage=密林.
- Approved readability adjustment: functional-route media opacity remains **0.72**. Use a moderate dual scrim (linear alpha about **0.14–0.26**, radial edge about **0.12**) so white copy stays legible while motion remains visible; form panels keep their own dark glass contrast for text and controls.
- No train-window chrome; no in-shell scene switcher (switching remains home-only).
- `prefers-reduced-motion: reduce` → static deepened canvas (same as create/join family).
- Video error / blocked autoplay → scenic gradient fallback; never blank/white.

### Home reliability and continuity

- Home scene changes persist to `localStorage` key `meetpoint:scenic-scene` (store stable scene id / index aligned with `SCENIC_VIDEOS`).
- Home continues through all four clips via `onEnded`; only the active clip may use eager `preload="auto"` so four simultaneous downloads do not delay the opening scene.
- Functional routes ignore the home preference and use their route-fixed mapping.
- Peak wait/reveal `PeakScenicAccent` remains for emotional peaks; shell light video provides page-level continuity. They do not replace each other.

### Spec redline update

| Before | After |
| --- | --- |
| Inner form/plan shells: no scenic video | All functional routes use one route-fixed muted low-opacity looping video under a dark scrim; only home cycles all four |

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

- `searchCities` **merges** local hub matches with Amap prefecture-level matches (local first, dedupe by code/name), instead of returning early when local length > 0.
- Use Amap administrative-district search (`/v3/config/district`) as the canonical remote source with a 5-second timeout and one bounded retry after transport/response failure. On the first remote search, also load the China administrative tree (`keywords=中国`, `subdistrict=2`) into a server-memory city index; a failed per-city lookup falls back to that Amap-sourced index instead of incorrectly reporting that the city does not exist. Failed index loads are not cached and retry on a later search. Input tips commonly returns the adcode of a district/POI (for example, 齐齐哈尔 → `230203`) and therefore may only enrich province labels; it must not be used as the canonical city adcode. The district result supplies the correct city-level code (`230200`).
- Accept Amap `level=city` prefecture-level units, province-administered cities (including non-`xxxx00` adcodes such as 济源 `419001`), and direct-administered municipalities. Province-direct counties remain excluded unless their administrative name is a city; reject ordinary county/district/POI rows. Return stable `amap-<adcode>` codes.
- Meeting candidate generation, distance, and hub library remain built-in `CITIES` only — Amap codes are valid **departure** selections, not automatic meeting candidates.
- Persisted Amap departure names must accompany their codes into route tasks so the ticket gateway can search them even though they are intentionally absent from built-in `CITIES`.
- `CityCombobox`: when query is non-empty and results are empty, show  
  `没找到这个市，试试完整市名，如「湛江」`.
- Placeholder: `输入城市名，如 北京 / 湛江`.
- Do not ship a full offline prefecture list; search + `AMAP_API_KEY` remain the coverage path. Operator docs already mention the key — note that departure coverage beyond hubs depends on it.

### Participant limit dropdown (create)

- Keep custom atmosphere listbox (not native `<select>`).
- Expand the panel in normal document flow below the trigger so it pushes「生成邀请链接」down instead of overlaying it.
- Close on select; close on outside click; `Escape` when cheap to add.
- Acceptance: with the menu open, the generate-link button remains fully visible and clickable.

---

## Implementation touchpoints (indicative)

- `src/components/layout/FunctionalScenicBackdrop.tsx` + `ShellScenicBackdrop.tsx` — root-mounted pathname-fixed scenic layer and playback checkpoints.
- `src/components/home/HomeHero.tsx` + small `src/lib/ui/scenic-preference.ts` — persist/read scene.
- `src/app/globals.css` — deepened canvas; shell scenic media/scrim classes.
- `src/components/plan/PublicPlanContent.tsx`, `src/app/create/page.tsx`, `src/lib/ui/api-error-message.ts`, manage/result notices — copy.
- `src/lib/city/city-provider.ts`, `CityCombobox.tsx` — merge search + empty hint.
- Tests: atmosphere tokens, home preference, responsive shell, public-plan-content, create-plan-page, provider-shells / city search, api-error messages.
- Docs: this spec; sync `AGENTS.md` + visual-direction + architecture on ship.

## Acceptance

- [ ] Home continuously cycles all four clips, retains manual selection, eagerly loads only the active clip, and reveals a playable scene without remaining stuck behind the fallback.
- [ ] Every functional route renders its assigned single looping clip under the readable scrim; reduced-motion and error fallbacks work.
- [ ] Host CTA shows「开始见面」/「见面安排中」; user-facing plan/create/error strings above have no calculator framing.
- [ ] Searching a non-hub prefecture (e.g. 湛江) returns a selectable city when Amap is configured; hub meeting-candidate rules unchanged.
- [ ] Create participant menu expands inline and does not cover「生成邀请链接」.
- [ ] `npm run lint`, `npm run test`, `npm run build` pass.
- [ ] Alternatives / manage IA untouched beyond the approved shared fixed scenic background.

## Out of scope / later backlog

- Broader plan/result motion redesign.
- Full prefecture meeting-candidate matrix.
- Dual desktop/H5 codebases.
- Rotating or expanding scenic clip catalog beyond existing `SCENIC_VIDEOS`.
