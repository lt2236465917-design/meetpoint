# Design And Implementation Authority

Use this order when documents disagree:

1. `AGENTS.md` — current coding, security, verification, and product guardrails.
2. `specs/2026-07-20-publication-safety-and-run-recovery-design.md` — approved and locally implemented Repository Audit Batch A contract.
3. `specs/2026-07-26-atomic-materialization-and-database-policy-replay-design.md` — approved, not-yet-implemented Repository Audit Batch B contract.
4. `plans/2026-07-26-atomic-materialization-and-database-policy-replay.md` — reviewed failing-first Batch B execution sequence.
5. `plans/2026-07-21-publication-safety-and-run-recovery.md` — completed failing-first Batch A execution record.
6. `specs/2026-07-15-multi-agent-recommendation-design.md` — approved product and architecture contract.
7. `specs/2026-07-17-ui-copy-and-visual-direction.md` — approved Chinese copy tone and visual direction (phases 1–4 shipped; phase 3 IA in `specs/2026-07-17-plan-result-ia-design.md`; phase 4 wait/reveal `PeakScenicAccent`).
8. `specs/2026-07-17-desktop-adaptive-shell-design.md` — **shipped UI shell:** no fake phone frame; adaptive `max-w-2xl` shell; home opening zero-scroll; records on `/records`.
9. `specs/2026-07-18-inner-atmosphere-meetup-copy-design.md` — **shipped + approved follow-up:** home cycles all four clips; every functional route loops one root-mounted deterministic scenic clip; host CTA「开始见面」; departure prefecture search hardening; create participant dropdown expands inline without covering the CTA. Plan: `plans/2026-07-18-inner-atmosphere-meetup-copy.md` (historical original execution plan).
10. `plans/2026-07-15-multi-agent-recommendation-implementation.md` — reviewed Task 1–14 execution sequence.
11. `.superpowers/sdd/progress.md` — authoritative completion ledger and next task.
12. `docs/architecture.md` and `docs/integration-guide.md` — current runtime and operator-facing reference.

All earlier dated plans and specifications are historical implementation records. They intentionally preserve the target-time, estimated-fare, three-city, explanation-only, and phone-canvas designs that existed when authored; they are not the current backlog or publication contract. Do not update their original checklists to represent current progress. (`plans/2026-07-17-atmosphere-tokens-responsive-shell.md` is historical for phase 2; shell sizing now follows the adaptive-shell spec.)

As of 2026-07-17, Multi-Agent Tasks 1–14 are complete. As of 2026-07-19, the adaptive shell, inner atmosphere, city-search hardening, persistent functional scenic layer, and local `2026-07-19.v2` recommendation policy are implemented. Calculation proposes without a preselected winner; when the model picks the deterministic winning city, schemes/totals canonicalize from `rankEligibleCities`. Canonical historical acceptance: `docs/acceptance/2026-07-15-multi-agent-live-acceptance.md`.

Repository Audit Batch A is complete locally as of `2026-07-26`; current runtime behavior is defined by `docs/architecture.md` and `docs/integration-guide.md`. Its hardening migration was not queried or applied remotely, and live supplier acceptance was not rerun. Batch B (atomic materialization and database policy replay) has an approved design but is not implemented. Batch C (input/date validation plus terminal-state UX hardening) remains confirmed audit backlog without a standalone approved spec or implementation plan. Operational detail lives in `.superpowers/sdd/progress.md`.

Batch B design `specs/2026-07-26-atomic-materialization-and-database-policy-replay-design.md` was approved on `2026-07-26`. Current runtime remains unchanged until its failing-first implementation plan is reviewed and executed.

Batch B failing-first plan `plans/2026-07-26-atomic-materialization-and-database-policy-replay.md` was reviewed on `2026-07-26`. It is the current execution sequence, not an implementation-completion record.
