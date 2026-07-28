# Alibaba Cloud Mainland Production Plan

**Design:** `docs/superpowers/specs/2026-07-27-aliyun-mainland-production-design.md`

## Phase 1 — Deployment contract

- [x] Add a focused deployment-config regression test and observe the missing configuration failure.
- [x] Add the production frontend Dockerfile and root `.dockerignore`.
- [x] Add Alibaba ECS Docker Compose, runtime-env example, and Nginx template.
- [x] Make the focused deployment test pass.

## Phase 2 — Operator documentation

- [x] Add the Alibaba ECS topology and filing boundary to architecture and integration docs.
- [x] Record Vercel as the overseas fallback, not the China release endpoint.
- [x] Add the new design to the authority index and progress ledger.

## Phase 3 — Local verification

- [x] Run the deployment-config test.
- [ ] Render `docker compose config` when Docker Compose is available.
- [x] Run root lint, full tests, and production build.
- [x] Run gateway lint, full tests, and build.
- [x] Inspect the final diff for credentials and unintended generated artifacts.

## Phase 4 — Alibaba Cloud acceptance

- [x] Confirm the filed domain, ECS region, operating system, architecture, public bandwidth, and DNS pre-switch state without storing private filing-owner details.
- [x] Add the public ICP footer, canonical `www` redirect, CDN-configurable scenic URLs, and remove Google Fonts.
- [x] Configure OSS/CDN for `media.meetpoint.space` and upload the scenic MP4 set.
- [x] Confirm an ECS access method without sharing passwords or private keys in chat.
- [x] Deploy both containers while the frontend remains loopback-only.
- [x] Smoke through an SSH tunnel and verify mainland outbound dependencies.
- [x] Configure DNS, HTTPS, Nginx, and public security-group ports.
- [ ] Complete real mainland-phone acceptance for the full flow and scenic video. Checklist + remote preflight: `docs/acceptance/2026-07-28-aliyun-mainland-phone-acceptance.md`.
- [ ] Complete post-launch public-security filing (operator compliance outside this repository).
- [ ] Only after the release is stable, inspect and remove duplicate Batch B worktrees/stashes, then commit and push the authorized knowledge changes.
