# Desktop Adaptive Shell (remove phone frame) — 2026-07-17

## Status

**Shipped** 2026-07-18 (adaptive `ResponsiveShell`, full-bleed `/`, `/records`).

Supersedes the “centered H5 phone canvas” presentation for `/`, create, join, plan, result, and records — without abandoning mobile usability.

## Decision

**去画框 + 自适应**

- Remove the fake phone frame (`max-w-md` + desktop letterboxing that mimics a device chrome).
- Use one responsive layout that works on desktop and phone: fluid width, real breakpoints — not a phone preview embedded in a desktop page.
- Keep shareable plan links working on phones; do **not** ship a separate “desktop-only product that breaks WeChat open.”

## Why

The phone-canvas approach made desktop look sparse and forced the home opening screen to scroll for “最近见面记录.” Doing H5-frame + desktop polish at once diluted both. Adaptive shell fixes presentation; mobile remains a first-class viewport, not a fake device.

## Home IA (locked with this shell)

1. **Opening viewport = zero scroll**  
   First screen is only the train-window hero: brand, one headline, short support, primary CTA (and optional scene switcher). No records below the fold on the opening canvas.

2. **最近见面记录 = `/records`**  
   Dedicated route entered via the hero control “最近记录”. Do not require scrolling the opening hero to discover history.

## Shell / layout contract

| Surface | Direction |
| --- | --- |
| `/` | Full-bleed hero; no `max-w-md` phone column |
| create / join / plan / result / records | Same adaptive `ResponsiveShell`; atmosphere tokens stay (dark scenic canvas, glass panels/CTAs); content column `max-w-2xl` |
| Phone | Narrow viewport naturally; readable single column; no nested “phone inside phone” |
| Desktop | Wider usable content width (`max-w-2xl` for forms/result), not device-chrome framing |

## Keep (do not regress)

- Chinese friend-tone copy; no calculator CTA framing on primary actions.
- No looping scenic video behind create/join/plan forms.
- `PeakScenicAccent` glass only on wait / reveal peaks; it reveals the route-fixed scene and must not mount another video.
- Plan StatusLane + glass schemes IA (`2026-07-17-plan-result-ia-design.md`).
- Publication / host-token / recommendation guards unchanged.

## Out of scope for this pass

- Deep alternatives / manage IA restyle (optional light atmosphere skin only if touched).
- Rebuilding recommendation or travel-gateway behavior.
- Dual separate “desktop app” and “H5 app” codebases.

## Acceptance (met)

- Desktop: no centered fake-phone chrome; outer page does not read as white letterbox + tiny device.
- Phone: open `/` and create/join without horizontal oddity; hero opening needs no scroll to feel complete.
- Records reachable on `/records`, not only by scrolling under a full-viewport hero.
- `npm run lint`, `npm run test`, and `npm run build` pass.
- Stable docs (`AGENTS.md`, `docs/architecture.md`, `docs/integration-guide.md`, `README.md`) use shipped adaptive-shell language (no “today phone-canvas / next adaptive” dual wording).

## Shipped touchpoints

- `src/components/layout/ResponsiveShell.tsx` — fluid adaptive `max-w-2xl` container (no device-frame sizing).
- `src/app/page.tsx` + `src/components/home/HomeHero.tsx` — full-bleed zero-scroll opening; “最近记录” → `/records`.
- `src/app/records/page.tsx` + `src/components/plan/RecentMeetingRecords.tsx` — dedicated records page.
- Tests: `tests/responsive-shell.test.ts`, `tests/home-page.test.ts`, `tests/records-page.test.ts`, records component tests.
