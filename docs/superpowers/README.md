# Design And Implementation Authority

Use this order when documents disagree:

1. `AGENTS.md` — current coding, security, verification, and product guardrails.
2. `specs/2026-07-20-publication-safety-and-run-recovery-design.md` — approved and locally implemented Repository Audit Batch A contract.
3. `specs/2026-07-26-atomic-materialization-and-database-policy-replay-design.md` — approved and locally implemented Repository Audit Batch B contract.
4. `plans/2026-07-26-atomic-materialization-and-database-policy-replay.md` — completed failing-first Batch B execution record.
5. `plans/2026-07-21-publication-safety-and-run-recovery.md` — completed failing-first Batch A execution record.
6. `specs/2026-07-15-multi-agent-recommendation-design.md` — approved product and architecture contract.
7. `specs/2026-07-17-ui-copy-and-visual-direction.md` — approved Chinese copy tone and visual direction (phases 1–4 shipped; phase 3 IA in `specs/2026-07-17-plan-result-ia-design.md`; phase 4 wait/reveal `PeakScenicAccent`).
8. `specs/2026-07-17-desktop-adaptive-shell-design.md` — **shipped UI shell:** no fake phone frame; adaptive `max-w-2xl` shell; home opening zero-scroll; records on `/records`.
9. `specs/2026-07-18-inner-atmosphere-meetup-copy-design.md` — **shipped + approved follow-up:** home cycles all four clips; every functional route loops one root-mounted deterministic scenic clip; host CTA「开始见面」; departure prefecture search hardening; create participant dropdown expands inline without covering the CTA. Plan: `plans/2026-07-18-inner-atmosphere-meetup-copy.md` (historical original execution plan).
10. `plans/2026-07-15-multi-agent-recommendation-implementation.md` — reviewed Task 1–14 execution sequence.
11. `.superpowers/sdd/progress.md` — authoritative completion ledger and next task.
12. `docs/architecture.md` and `docs/integration-guide.md` — current runtime and operator-facing reference.

Proposed next work is non-authoritative until explicitly approved: `specs/2026-07-27-input-integrity-and-terminal-ux-hardening-design.md` and its draft plan `plans/2026-07-27-input-integrity-and-terminal-ux-hardening.md`.

All earlier dated plans and specifications are historical implementation records. They intentionally preserve the target-time, estimated-fare, three-city, explanation-only, and phone-canvas designs that existed when authored; they are not the current backlog or publication contract. Do not update their original checklists to represent current progress. (`plans/2026-07-17-atmosphere-tokens-responsive-shell.md` is historical for phase 2; shell sizing now follows the adaptive-shell spec.)

As of 2026-07-17, Multi-Agent Tasks 1–14 are complete. As of 2026-07-19, the adaptive shell, inner atmosphere, city-search hardening, persistent functional scenic layer, and local `2026-07-19.v2` recommendation policy are implemented. Calculation proposes without a preselected winner; when the model picks the deterministic winning city, schemes/totals canonicalize from `rankEligibleCities`. Canonical historical acceptance: `docs/acceptance/2026-07-15-multi-agent-live-acceptance.md`.

Repository Audit Batches A and B are complete. Their hardening migrations were applied to the linked Supabase project on `2026-07-27`; postflight privilege/Realtime checks and rollback-safe automatic/alternative publication smoke passed. The controlled supplier-backed run safely ended incomplete because real quote coverage was insufficient, so no completed live supplier publication is claimed. Batch C now has a proposed design and draft plan but remains unapproved and unimplemented. Operational detail lives in `.superpowers/sdd/progress.md` and `docs/acceptance/2026-07-27-repository-audit-batch-b-remote-acceptance.md`.

Batch B design `specs/2026-07-26-atomic-materialization-and-database-policy-replay-design.md` was approved and implemented locally on `2026-07-26`.

Batch B failing-first plan `plans/2026-07-26-atomic-materialization-and-database-policy-replay.md` was reviewed and completed locally on `2026-07-26`. Executable evidence: PostgreSQL 17.10, 5 files / 74 tests; root lint; 71 files / 457 tests; production build. Gateway source files were unchanged, so gateway gates were not rerun.

Batch C proposed design `specs/2026-07-27-input-integrity-and-terminal-ux-hardening-design.md` narrows the verified remaining scope to canonical departure identity, real calendar dates, fallback arrival-instant aggregation, private preview terminal UX, and bounded plan-code collision recovery. Its draft plan is not an implementation-completion record.
