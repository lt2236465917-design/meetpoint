# Alibaba Cloud Mainland Production Design

**Status:** Live on Alibaba Cloud ECS for `www.meetpoint.space`; full create/join/plan/result mainland-phone acceptance and public-security filing remain open

**Date:** 2026-07-27

## Problem

The Vercel Services release is healthy outside mainland China, but the only public aliases use `*.vercel.app` and timed out on a real mainland network. Vercel has no mainland infrastructure and does not guarantee availability there. The product targets people arranging meetings inside China, so an overseas-only endpoint is not an accepted production release.

The operator's Alibaba Cloud ICP filing is approved for `meetpoint.space`, with `www.meetpoint.space` recorded as the homepage. Public DNS, HTTPS, OSS/CDN scenic delivery, and the ECS Compose stack are live; residual acceptance is full product-flow phone verification plus post-launch public-security filing.

## Decision

Use one Alibaba Cloud mainland ECS instance as the initial China production target. Run two containers on one private Docker network:

- `frontend`: the Next.js application, reachable only on the ECS loopback interface at host port `3001` (container `3000`) so co-hosted workloads can keep host `3000`.
- `travel_gateway`: the existing isolated gateway image, reachable only by the frontend at `http://travel-gateway:8080` and never published on a host port.

After ICP approval, host Nginx terminates HTTPS and proxies the filed domain to `127.0.0.1:3001`. Vercel remains an overseas fallback and independent release reference.

The canonical public host is `www.meetpoint.space`; the apex redirects to it. The public filing footer is `京ICP备2026025115号-3` linked to MIIT. Do not copy filing-owner identity or contact details into code, documentation, logs, or public pages.

## Why ECS

- It is an Alibaba Cloud resource eligible for the current ICP filing when purchased in a mainland region with the required term and public bandwidth.
- It preserves the shipped frontend-plus-private-gateway topology without redesigning the application around another runtime.
- A single host and Docker Compose are easier to inspect, back up, and hand off than ACK, and avoid splitting the two services across unrelated serverless products.
- The deployment can be built and tested behind an SSH tunnel while the filing is pending, without publishing the domain.

## Runtime Contract

- Build both services from the same verified source commit.
- Use Node.js 20 production images and run as the unprivileged `node` user.
- Install dependencies with `npm ci`, run production builds, and prune development dependencies.
- Inject `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as public build arguments for the frontend. All server credentials remain runtime-only variables.
- Build the mainland frontend with `NEXT_PUBLIC_SCENIC_BASE_URL=https://media.meetpoint.space`. OSS plus Alibaba Cloud CDN serves the large scenic MP4 files; the 3 Mbps ECS origin serves application HTML, Next.js assets, and APIs only.
- Load runtime variables from an untracked `.env.production`; commit only a key-only example.
- Bind `3001:3000` to `127.0.0.1`. Do not publish gateway port `8080`.
- Use container health checks for `/` and `/healthz`; restart failed services automatically.
- Preserve the gateway bearer-token boundary even on the private container network.

## Launch Boundary

- Keep DNS empty while the application, gateway, TLS, and outbound dependencies are being prepared.
- Validate first through an SSH tunnel to the loopback-bound frontend.
- Before switching DNS, confirm the ICP footer, canonical redirect, HTTPS certificate, OSS/CDN byte-range video delivery, and security-group rules.
- Configure only ports `80`/`443` as public application ingress; keep `3001` and `8080` private.
- Complete the required public-security filing after launch.

## External Dependency Gate

The ECS must prove outbound access to Supabase, Amap, DeepSeek, and FlyAI before publication. A reachable frontend alone is insufficient: create/join/plan/result and the private gateway path must work from the mainland host. Supplier coverage may still end safely incomplete and must never be replaced with estimates.

## Acceptance

- Deployment configuration tests verify the loopback-only frontend binding, private gateway, runtime secret injection, and unprivileged images.
- `docker compose config` renders successfully without production secret values being committed.
- Root lint, tests, and build pass; gateway lint, tests, and build pass.
- Before ICP approval, an SSH-tunneled smoke covers home rendering and gateway health without public exposure.
- After ICP approval, a real mainland phone covers home, create, join, plan, result, scenic video playback, and API requests over the filed HTTPS domain.
- Only after stable mainland acceptance may release-safety worktrees and stashes be inspected and removed.

## Non-goals

- No automatic push or deployment from Git.
- No ACK, SAE, CDN, or multi-instance high-availability migration in this release.
- No migration of Supabase or supplier systems without separate evidence that mainland outbound dependencies are the bottleneck.
- No credential rotation claim; the existing operator waiver remains unchanged.
