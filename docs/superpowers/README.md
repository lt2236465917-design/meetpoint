# Design And Implementation Authority

Use this order when documents disagree:

1. `AGENTS.md` — current coding, security, verification, and product guardrails.
2. `specs/2026-07-15-multi-agent-recommendation-design.md` — approved product and architecture contract.
3. `specs/2026-07-17-ui-copy-and-visual-direction.md` — approved Chinese copy tone and visual direction (phases 1–4 shipped; phase 3 IA in `specs/2026-07-17-plan-result-ia-design.md`; phase 4 wait/reveal `PeakScenicAccent`).
4. `specs/2026-07-17-desktop-adaptive-shell-design.md` — **shipped UI shell:** no fake phone frame; adaptive `max-w-2xl` shell; home opening zero-scroll; records on `/records`.
5. `specs/2026-07-18-inner-atmosphere-meetup-copy-design.md` — **shipped + approved follow-up:** home cycles all four clips; every functional route loops one root-mounted deterministic scenic clip; host CTA「开始见面」; departure prefecture search hardening; create participant dropdown expands inline without covering the CTA. Plan: `plans/2026-07-18-inner-atmosphere-meetup-copy.md` (historical original execution plan).
6. `plans/2026-07-15-multi-agent-recommendation-implementation.md` — reviewed Task 1–14 execution sequence.
7. `.superpowers/sdd/progress.md` — authoritative completion ledger and next task.
8. `docs/architecture.md` and `docs/integration-guide.md` — current runtime and operator-facing reference.

All earlier dated plans and specifications are historical implementation records. They intentionally preserve the target-time, estimated-fare, three-city, explanation-only, and phone-canvas designs that existed when authored; they are not the current backlog or publication contract. Do not update their original checklists to represent current progress. (`plans/2026-07-17-atmosphere-tokens-responsive-shell.md` is historical for phase 2; shell sizing now follows the adaptive-shell spec.)

As of 2026-07-17, Multi-Agent Tasks 1–14 are complete. As of 2026-07-19, the adaptive shell, inner atmosphere, city-search hardening, persistent functional scenic layer, and local `2026-07-19.v2` recommendation policy are implemented. Calculation proposes without a preselected winner; when the model picks the deterministic winning city, schemes/totals canonicalize from `rankEligibleCities`. Canonical historical acceptance: `docs/acceptance/2026-07-15-multi-agent-live-acceptance.md`. Current operational next steps live only in `.superpowers/sdd/progress.md`.
