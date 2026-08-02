# DeepSeek Chat Completions vs Responses Acceptance

Date: 2026-08-01

## Decision

The Responses capability is integrated behind the provider-neutral `AgentModel` boundary and cleared the predeclared credentialed production-like comparison gate. Production default remains `chat_completions`: the ECS runtime environment has not been independently inspected or deployed from this working tree, and a one-variable rollback has not yet been exercised on the production host.

This is a protocol comparison on the same `deepseek-v4-flash` model, not a model upgrade claim.

## Implemented boundary

- `DEEPSEEK_TRANSPORT=chat_completions|responses`; missing defaults to Chat and unknown values fail closed.
- `DEEPSEEK_SHADOW_TRANSPORT` plus sample, concurrency, call, and token caps; defaults off.
- Primary output alone reaches agents and persistence. Shadow calls have no proposal, `agent_events`, run-state, Supabase, or shared-result writer.
- Both paths share input redaction checks, concrete Zod schema policy, unknown-key preservation, exact local parsing, 15-second SDK timeout, one invalid-output retry, stable error mapping, trusted-model allowlist, safe Chinese explanations, deterministic validators, and publication guards.
- Responses sends only documented stateless fields. Simple object schemas use remote strict `json_schema`; DeepSeek returned HTTP 400 for the calculation/supervisor top-level union schemas, so those use remote `json_object` while the same exact local schema remains mandatory. No unsupported conversation, storage, background, metadata, or tool capability is used.
- Safe telemetry includes only allowlisted agent/transport, schema/downstream qualification counts, latency, aggregate token/cost proxy, retry/error counts, and HTTP/category groups. It never records prompt, input, trace, raw output, parsed proposal, participant facts, or credentials.

## Credentialed evidence

The first credentialed run exposed a real compatibility defect: the endpoint accepted a simple strict object schema but rejected the existing top-level union schemas as `400 / structured_output_config`. After adding the documented JSON-object compatibility path plus unchanged local strict validation, a three-pair smoke passed 3/3 on both transports.

The final run executed 34 iterations across manager probe, Calculation, and Supervisor cases: 102 paired calls per transport, including 34 Calculation and 34 Supervisor calls.

| Metric | Chat Completions | Responses |
| --- | ---: | ---: |
| Calls | 102 | 102 |
| Schema qualified | 88 | 102 |
| Downstream qualified | 88 | 102 |
| Calculation qualified | 34 / 34 | 34 / 34 |
| Supervisor qualified | 34 / 34 | 34 / 34 |
| p95 latency | 2489 ms | 2242 ms |
| Total tokens | 49,928 | 50,486 |
| Invalid-output retries | 19 | 0 |
| Final invalid output | 14 | 0 |
| Timeout / unavailable | 0 / 0 | 0 / 0 |
| HTTP 4xx / 5xx | 0 / 0 | 0 / 0 |
| Estimated base-rate cost | ¥0.02955728 | ¥0.02990928 |

The 14 Chat failures were confined to the synthetic manager schema probe. The shipped `ManagerAgent` is deterministic and does not call `AgentModel`; production model consumers Calculation and Supervisor were 100% qualified on both transports.

Cost uses the official 2026-08-01 base rates (cached input ¥0.02/M, uncached input ¥1/M, output ¥2/M) and excludes the announced peak multiplier. Responses cost was about 1.012× Chat, below the 1.25× gate.

## Gate evaluation

- 102 paired calls, with at least 30 Calculation and 30 Supervisor calls: PASS.
- No prompt/response/participant leakage and no shadow business writes: PASS by implementation tests and redacted output inspection.
- Responses schema rate ≥99% and not below Chat: PASS (100%).
- Calculation/Supervisor qualification ≥98% and not below Chat: PASS (100% each).
- Timeout/unavailable no more than one percentage point above Chat: PASS (0%).
- p95 <15 seconds and ≤1.25× Chat: PASS (2.242s and ~0.90×).
- Average token/cost ≤1.25× Chat: PASS (~1.012× estimated cost).

## Production status

Production follow-up completed on 2026-08-02. The ECS effective model was verified as `deepseek-v4-flash`; the dual-transport build was deployed; authenticated Chat, Responses, bounded shadow, controlled Responses-primary, and one-variable rollback smokes passed. The final effective runtime is deliberately `chat_completions` with shadow off and sample rate zero. See `docs/acceptance/2026-08-02-reliable-baseline-production-acceptance.md`.

- Historical production `agent_events` through 2026-07-20 record `deepseek-v4-flash` model-requested/model-completed events.
- The local operator environment has a valid credential and no `DEEPSEEK_MODEL` override, so its verified calls used the repository default `deepseek-v4-flash`.
- Current ECS `DEEPSEEK_MODEL` / `DEEPSEEK_TRANSPORT` values were not independently read: no SSH/Workbench access or connected Chrome session was available. Historical events cannot prove a post-2026-07-28 environment override is absent.
- Production selection therefore remains unverified and unchanged. Do not set `responses` until the ECS env is inspected, the new build is deployed, shadow-off/Chat rollback is confirmed, and post-deploy agent smoke passes.
