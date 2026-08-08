# External Availability Monitoring Acceptance

Date: 2026-08-08

## Outcome

The zero-recurring-cost external availability layer is accepted. UptimeRobot monitors the canonical homepage and one server-rendered API endpoint every five minutes and routes simulated and real state changes to the operator's verified email destination. No email address, account token, or other notification credential is stored in this repository.

This closes public homepage/API availability alerting only. It does not claim automatic detection of Docker process failures behind a still-responsive proxy, `run-worker` backlog, travel-gateway supplier degradation, database policy drift, missing recommendation coverage, or baseline/live divergence.

## Accepted monitors

- `www.meetpoint.space`: HTTP(S) monitor for `https://www.meetpoint.space/`.
- `meetpoint API - 城市搜索`: HTTP(S) monitor for `https://www.meetpoint.space/api/cities/search?q=%E5%8C%97%E4%BA%AC`.
- Both monitors use the free five-minute interval with email notification enabled and no SMS, voice, or paid upgrade.

## Evidence

- Before monitor creation, a direct production request to the city-search endpoint returned the canonical Beijing row.
- The UptimeRobot dashboard reported `0 Down`, `2 Up`, `0 Paused`, and `2 of 50` monitors in use.
- The incident list was empty after both first checks completed.
- The operator received paired `TEST: Monitor is DOWN` and `TEST: Monitor is UP` messages for both monitors. These are deliberate notification-path simulations, not production incidents.

## Cost boundary

- UptimeRobot Free was selected: no credit card, five-minute checks, and 50-monitor capacity at the acceptance date.
- Alibaba Cloud Network Analysis and Monitoring was activated during evaluation, but no scheduled probe task was saved. The product states that unused activation does not incur probe charges. Do not create an Alibaba scheduled probe without a fresh node/frequency cost review.
- Keep SMS, voice, premium intervals, additional paid regions, and automatic credit refill disabled unless the operator explicitly approves their cost.

## Operator response

- A subject prefixed with `TEST:` requires no incident response.
- If both real monitors report `DOWN`, inspect DNS/HTTPS, Nginx, ECS, and the frontend container first.
- If only the API monitor reports `DOWN`, inspect the Next.js server path and its upstream city-provider dependency first.
- A subsequent `UP` message confirms external recovery. If no `UP` arrives within ten minutes, continue server-side diagnosis.
- Internal redacted log alerts and scheduled coverage/divergence checks remain separate operational work; until they are wired, follow the manual checks in `docs/integration-guide.md`.
