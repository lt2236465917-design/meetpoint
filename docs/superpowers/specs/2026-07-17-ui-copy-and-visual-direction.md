# UI Copy And Visual Direction (2026-07-17)

## Status

Approved product-facing direction for Chinese copy and home-hero visual language. Implementation of the visual phases below is **not** complete; only the in-app copy pass and an external hero preview prototype exist.

## Copy principles

- Flow and marketing surfaces (home, create, join, wait-for-friends) speak as **friends about to meet**, not as a fare-lookup tool.
- Avoid primary CTA language that frames the product as a calculator (`开算`, `开始计算` as the hero action). Prefer meeting-outcome language (`发起见面计划`, `算出见面城市` only where the action is literally starting the run).
- Result and progress surfaces stay trustworthy: real fares, no estimates, incomplete coverage does not publish. Translate engineering jargon for users (`供应商限流` → human wording; quote fingerprints stay folded under data-source disclosure).
- Prefer `朋友` over `全员` in user-facing prose when the audience is participants, not operators.
- Recommended Chinese explanations must stay inside `SAFE_EXPLANATIONS_ZH` in `src/lib/agent/prompts.ts`. Changing them requires updating the whitelist, model prompt example, fallback store, and agent tests together.

## Shipped in this pass (product repo)

- Home, create, join, public plan, progress, result shell, alternatives, and API error strings rewritten toward the tone above.
- `SAFE_EXPLANATIONS_ZH` updated to warmer but still fact-safe sentences.
- Scheme cards: optional short sublabels; quote evidence moved into a `<details>` “数据来源” disclosure.
- Browser tab title set to Chinese.

## Home hero visual direction

Prototype (not yet wired into Next.js):

- Absolute path: `/Users/lixinyu/Desktop/meetpoint项目开头展示`
- Entry: `src/MeetpointPreview.tsx` (current `src/main.tsx` mounts this preview; original Lumora `src/App.tsx` remains for reference)
- Metaphor: train window = on the way to meet friends
- Readability: prefer **text-shadow** over a full-screen dark scrim (scrim kills scenery)
- Primary CTA (approved preview state): semi-transparent glass pill, slightly shorter than full content column (`~18–19.5rem`), larger white label text
- Do **not** put looping scenic video behind form-heavy functional pages; reuse tokens (type, glass, atmosphere) instead
- Video optional later only at emotional peaks: calculation wait, result reveal

## Planned phases (next sessions)

1. Port approved home hero into product `/` (Meetpoint copy + train/scenery; CTA → `/create`)
2. Extract design tokens into `ResponsiveShell` / globals so create/join/plan do not feel like a different product
3. Interaction/IA pass on plan and result pages (less card stacking; clearer “who’s missing / ready / result”)
4. Optional light video only on wait / reveal moments

## Non-goals

- Replacing publication guards, quote verification, or host-token confirmation rules
- Running cinematic video on every screen
- Editing historical `docs/superpowers/plans/*` checklists to rewrite old copy examples
