# Design And Implementation Authority

Use this order when documents disagree:

1. `AGENTS.md` — current coding, security, verification, and product guardrails.
2. `specs/2026-07-15-multi-agent-recommendation-design.md` — approved product and architecture contract.
3. `plans/2026-07-15-multi-agent-recommendation-implementation.md` — reviewed Task 1–14 execution sequence.
4. `.superpowers/sdd/progress.md` — authoritative completion ledger and next task.
5. `docs/architecture.md` and `docs/integration-guide.md` — current runtime and operator-facing reference.

All earlier dated plans and specifications are historical implementation records. They intentionally preserve the target-time, estimated-fare, three-city, and explanation-only designs that existed when authored; they are not the current backlog or publication contract. Do not update their original checklists to represent current progress.

As of 2026-07-16, Multi-Agent Tasks 1–13 are implemented and Task 14 remains the release gate. Calculation proposes a city without a preselected winner in model input; when that city matches the deterministic winner, schemes and totals are canonicalized from `rankEligibleCities` before validation. A fresh post-fix guarded publication on `542713a` is recorded; exposed Supabase credential rotation remains the open release blocker. Use `docs/acceptance/2026-07-15-multi-agent-live-acceptance.md` as the canonical source for current Task 14 evidence and blockers. Do not describe Multi-Agent as released while that blocker remains.
