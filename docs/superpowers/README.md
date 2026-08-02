# Design And Implementation Authority

Use this order when documents disagree:

1. `AGENTS.md` — current coding, security, verification, and product guardrails.
2. `specs/2026-08-01-reliable-baseline-and-live-fare-enhancement-design.md` — approved contract separating the always-available deterministic baseline city from complete-evidence live-fare schemes.
3. `plans/2026-08-01-reliable-baseline-and-live-fare-enhancement.md` — completed implementation and 2026-08-02 production-acceptance record; WeChat direct-open classification remains an operational residual.
4. `specs/2026-07-20-publication-safety-and-run-recovery-design.md` — approved and locally implemented Repository Audit Batch A contract; its real-fare publication guard remains authoritative for saving/fast schemes.
5. `specs/2026-07-26-atomic-materialization-and-database-policy-replay-design.md` — approved and locally implemented Repository Audit Batch B contract.
6. `specs/2026-07-27-input-integrity-and-terminal-ux-hardening-design.md` — approved and locally implemented Repository Audit Batch C contract.
7. `specs/2026-07-27-aliyun-mainland-production-design.md` — approved mainland deployment and ICP safety boundary.
8. `specs/2026-07-28-background-recommendation-run-worker-design.md` — approved Compose `run-worker` so automatic and alternative runs advance without an open browser tab.
9. `plans/2026-07-28-background-recommendation-run-worker.md` — Compose `run-worker` plan: Tasks 1–7 complete; ECS leave-and-finish checklist #11 PASS (2026-07-28); `202607280001` SQL applied manually, with its migration-history gap recorded by the 2026-08-01 operations report.
10. `plans/2026-07-27-aliyun-mainland-production.md` — current mainland release execution plan.
11. `plans/2026-07-27-input-integrity-and-terminal-ux-hardening.md` — completed failing-first Batch C execution record.
12. `plans/2026-07-26-atomic-materialization-and-database-policy-replay.md` — completed failing-first Batch B execution record.
13. `plans/2026-07-21-publication-safety-and-run-recovery.md` — completed failing-first Batch A execution record.
14. `specs/2026-07-15-multi-agent-recommendation-design.md` — approved product and architecture contract.
15. `specs/2026-07-17-ui-copy-and-visual-direction.md` — approved Chinese copy tone and visual direction (phases 1–4 shipped; phase 3 IA in `specs/2026-07-17-plan-result-ia-design.md`; phase 4 wait/reveal `PeakScenicAccent`).
16. `specs/2026-07-17-desktop-adaptive-shell-design.md` — **shipped UI shell:** no fake phone frame; adaptive `max-w-2xl` shell; home opening zero-scroll; records on `/records`.
17. `specs/2026-07-18-inner-atmosphere-meetup-copy-design.md` — **shipped + approved follow-up:** home cycles all four clips; every functional route loops one root-mounted deterministic scenic clip; host CTA「开始见面」; departure prefecture search hardening; create participant dropdown expands inline without covering the CTA. Plan: `plans/2026-07-18-inner-atmosphere-meetup-copy.md` (historical original execution plan).
18. `plans/2026-07-15-multi-agent-recommendation-implementation.md` — reviewed Task 1–14 execution sequence.
19. `.superpowers/sdd/progress.md` — authoritative completion ledger and next task.
20. `docs/architecture.md` and `docs/integration-guide.md` — current runtime and operator-facing reference.

All earlier dated plans and specifications are historical implementation records. They intentionally preserve the target-time, estimated-fare, three-city, explanation-only, and phone-canvas designs that existed when authored; they are not the current backlog or publication contract. Do not update their original checklists to represent current progress. (`plans/2026-07-17-atmosphere-tokens-responsive-shell.md` is historical for phase 2; shell sizing now follows the adaptive-shell spec.)

As of 2026-07-17, Multi-Agent Tasks 1–14 are complete. As of 2026-07-19, the adaptive shell, inner atmosphere, city-search hardening, persistent functional scenic layer, and local `2026-07-19.v2` recommendation policy are implemented. Calculation proposes without a preselected winner; when the model picks the deterministic winning city, schemes/totals canonicalize from `rankEligibleCities`. Canonical historical acceptance: `docs/acceptance/2026-07-15-multi-agent-live-acceptance.md`.

Repository Audit Batches A–C are complete and shipped on `main`. The A/B hardening migrations were applied to the linked Supabase project on `2026-07-27`; postflight privilege/Realtime checks and rollback-safe automatic/alternative publication smoke passed. Batch C required no database or gateway change. Operational detail lives in `.superpowers/sdd/progress.md` and the Batch B/C acceptance records.

The Vercel Services release remains the overseas fallback (browser advance only; no run-worker in the current release). The primary China host is live at `www.meetpoint.space` (loopback frontend on host `3001`, private gateway + `run-worker`, Nginx HTTPS, OSS/CDN scenic at `media.meetpoint.space`). On 2026-08-02 the migration-history gap was safely reconciled after a restorable backup rehearsal, `202608010001` was applied, the current tree was deployed, authenticated gateway/DeepSeek switch-and-rollback smokes passed, and fresh mainland-phone completed/incomplete/failed/retry flows plus deterministic replay passed. Current acceptance: `docs/acceptance/2026-08-02-reliable-baseline-production-acceptance.md`. WeChat direct-open still shows an ICP safety interstitial even though the system browser succeeds; keep release-safety worktrees/stashes until that residual and external alerting are deliberately closed.
