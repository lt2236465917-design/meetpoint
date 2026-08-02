# Alibaba Cloud ECS Deployment

This directory packages the verified Next.js frontend and private travel gateway for one Alibaba Cloud mainland ECS instance. The filing domain must remain offline until first ICP approval.

## Services

- **frontend** — Next.js app, loopback-only on host `3001`.
- **travel-gateway** — private supplier gateway on the Compose network; no host port.
- **run-worker** — private recommendation worker (`target: worker`); advances automatic and alternative runs without browser POSTs. Host confirmation of alternatives stays manual. Leave-and-finish checklist #11 is PASS (2026-07-28); keep the service healthy with no host port.

## ECS baseline

- Mainland China region matching the ICP filing order.
- Subscription term of at least three months with public bandwidth.
- Alibaba Cloud Linux 3 or Ubuntu 24.04 LTS on x86_64.
- Docker Engine with the Compose plugin.
- During filing, allow SSH only from the operator's trusted IP. Do not open `80`, `443`, `3001`, or `8080` publicly.

## Prepare

Create the untracked runtime file without sending its values through chat or committing it:

```bash
cp deploy/aliyun/production.env.example deploy/aliyun/.env.production
chmod 600 deploy/aliyun/.env.production
```

Fill every required value. `NEXT_PUBLIC_*` values are public browser configuration and are also passed to the frontend build. Server credentials remain runtime-only variables. Use one strong random `TRAVEL_GATEWAY_TOKEN` value for both services.

For the first deployment of the dual DeepSeek transport build, set `DEEPSEEK_MODEL=deepseek-v4-flash`, `DEEPSEEK_TRANSPORT=chat_completions`, `DEEPSEEK_SHADOW_TRANSPORT=off`, and `DEEPSEEK_SHADOW_SAMPLE_RATE=0`. The protocol selector is server-only; it must never use a `NEXT_PUBLIC_*` name. Responses is a candidate protocol for the same model, not a model upgrade.

Set `NEXT_PUBLIC_SCENIC_BASE_URL=https://media.meetpoint.space` after the scenic MP4 files are uploaded to OSS and that subdomain is attached to Alibaba Cloud CDN. The application keeps same-origin `/scenic/*` paths when this variable is empty, which is useful for local and Vercel verification but is not suitable for the ECS instance's 3 Mbps public bandwidth.

Validate configuration without printing interpolated secrets:

```bash
docker compose \
  --env-file deploy/aliyun/.env.production \
  -f deploy/aliyun/compose.yaml \
  config --quiet
```

The backup-first migration procedure was exercised on 2026-08-02: a logical backup passed a PostgreSQL 17.10 restore rehearsal, then `202607280001` and `202608010001` were applied in order and passed migration-history, role, RPC, constraint, and rollback postflight. Future migrations still require a fresh restorable backup and list/dry-run; do not infer state from prior SQL behavior. Evidence: `docs/acceptance/2026-08-02-reliable-baseline-production-acceptance.md`.

Before deployment, run both application gate sets and the credentialed, redacted FlyAI canary from the gateway directory. A successful canary is a sampled contract check, not supplier-wide recovery:

```bash
npm run lint
npm run test
npm run build

cd services/travel-provider-gateway
npm run lint
npm run test
npm run build
npm run probe:contract
```

## Build and start before ICP approval

```bash
docker compose \
  --env-file deploy/aliyun/.env.production \
  -f deploy/aliyun/compose.yaml \
  up --build -d

docker compose \
  --env-file deploy/aliyun/.env.production \
  -f deploy/aliyun/compose.yaml \
  ps
```

The frontend is deliberately bound to ECS loopback only and the gateway has no host port. Test the frontend from the operator machine through an SSH tunnel:

```bash
ssh -N -L 3001:127.0.0.1:3001 <ecs-user>@<ecs-public-ip>
```

Then open `http://127.0.0.1:3001`. The Compose file binds the frontend to host loopback port `3001` so it does not collide with other sites that already use host `3000`. Do not use the filing domain or publish the ECS IP as a website during first filing.

After every deploy, treat `/healthz` only as process reachability. Run one bearer-authenticated `POST /v1/search` from inside the private Compose network for both normalized modes, then run a credentialed Calculation/Supervisor smoke through the Web app. Keep output redacted. Confirm the effective model is `deepseek-v4-flash`, primary transport is Chat, and shadow is off before accepting the deployment.

## DeepSeek shadow, switch, and rollback

Do not hard-switch on the first dual-transport deployment. After Chat smoke passes, a later bounded shadow can set `DEEPSEEK_SHADOW_TRANSPORT=responses` with explicit sample, concurrency, call, and token caps. The shadow must not change proposals, agent events, run state, or shared results; set the shadow transport to `off` or sample rate to `0` for immediate shutdown.

Only after the documented paired gate and production-like shadow evidence may the operator set `DEEPSEEK_TRANSPORT=responses`. Rebuild/restart the affected Compose services, run an authenticated agent smoke, and retain `DEEPSEEK_TRANSPORT=chat_completions` as the one-variable rollback. Exercise that rollback before calling the switch production-ready.

The full switch-and-rollback path passed on 2026-08-02. Production intentionally finishes on Chat primary with shadow off; Responses remains an accepted, reversible capability rather than the selected default.

## Monitoring

- Alert on every `schema_drift_circuit_open` and repeated same-signature `PROVIDER_INVALID_RESPONSE`.
- Dashboard FlyAI normalized coverage and p95 latency by mode; a green `/healthz` does not clear authenticated-search failures.
- Check recent automatic runs for verified participant coverage and any completed run lacking complete evidence.
- Track baseline/live city divergence for missing data or distribution shifts, not as an error on every differing city.
- Keep `deepseek_shadow` telemetry redacted; it may contain only transport/agent, qualification, latency, aggregate tokens, retries, and stable error categories.

## Launch after ICP approval

1. Confirm the shipped footer shows the approved ICP number and links to MIIT.
2. Upload `public/scenic/*.mp4` to the OSS `scenic/` prefix and configure `media.meetpoint.space` through Alibaba Cloud CDN with byte-range support.
3. Install host Nginx and an approved TLS certificate covering `meetpoint.space` and `www.meetpoint.space`.
4. Install `meetpoint.nginx.conf.template` and test with `nginx -t`.
5. Resolve `www` and the apex domain to the ECS public IP; the apex redirects to the filed canonical `www` host.
6. Open only `80` and `443` publicly in the security group; keep `3001` and `8080` closed.
7. Run the complete mainland-phone acceptance before treating production as stable.

Do not remove the Vercel release, old Batch B worktrees, or safety stashes until mainland acceptance is stable.
