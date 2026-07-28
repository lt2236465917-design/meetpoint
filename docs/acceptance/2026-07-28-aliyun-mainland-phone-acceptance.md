# 2026-07-28 Alibaba Cloud Mainland Phone Acceptance

**Status:** OPEN — remote preflight PASS; real mainland-phone create/join/plan/result and public-security filing remain required.

**Canonical host:** `https://www.meetpoint.space`  
**Scenic CDN:** `https://media.meetpoint.space`  
**Source commit (local packaging + scenic black-screen fix):** `74ec1a4`  
**Prior overseas Vercel evidence:** `docs/acceptance/2026-07-27-production-release-acceptance.md`

## Remote preflight (2026-07-28, non-mainland automation)

| Check | Result | Evidence |
| --- | --- | --- |
| HTTPS home | PASS | `GET https://www.meetpoint.space/` → HTTP 200, Nginx, ICP footer `京ICP备2026025115号-3` |
| Apex redirect | PASS | `https://meetpoint.space/` → `301` → `https://www.meetpoint.space/` |
| Scenic CDN byte-range | PASS | `still-water-mobile.mp4` → HTTP 200, `video/mp4`, `Accept-Ranges: bytes`, OSS/CDN via Tengine |
| Home HTML scenic URLs | PASS | Absolute `media.meetpoint.space/scenic/*` desktop + mobile MP4s present |
| City search API | PASS | `GET /api/cities/search?q=上海` → `上海` |
| Create + join + plan read | PASS | Plan `FXTAUB`, two participants, `shareUrl` on filed host |
| Create / plan / result pages | PASS | `/create`, `/p/FXTAUB`, `/p/FXTAUB/result`, `/p/VXYI6G/result` → HTTP 200 |
| Historical completed run | PASS | `GET /api/plans/VXYI6G` → `latestRun.status=completed`, three participants |

Remote browser home/create UI rendered Chinese copy and adaptive glass forms. Autoplay may fall to the static poster in non-phone automation; **do not treat that as mainland scenic acceptance.**

Remote preflight does **not** claim a fresh supplier-backed `completed` recommendation on the Alibaba host.

## Mainland phone checklist (operator)

Fill every row on a real mainland mobile network. Prefer WeChat in-app browser plus one system browser (Safari / Chrome / 系统浏览器). Xiaomi/MIUI native video hijack remains **deferred** and must not block this gate.

| # | Check | Device / browser | Result | Notes |
| --- | --- | --- | --- | --- |
| 1 | `/` loads; brand `meetpoint`; CTA「发起见面计划」; ICP footer opens MIIT | | PENDING | |
| 2 | Home cycles all four scenes (金色黄昏 / 静水 / 密林 / 破晓); manual scene buttons work; no mid-transition black blank | | PENDING | If stuck black: see ECS rebuild below; debug with `/?videoDebug=1` |
| 3 | First gesture recovers autoplay when the browser blocks it; `prefers-reduced-motion` may stay static | | PENDING | |
| 4 | `/create` usable at ~390×844; date min = today; generate invite → copy `https://www.meetpoint.space/p/…` | | PENDING | Record plan code: |
| 5 | Second device/browser opens join; departure search (incl. a prefecture such as「湛江」); modes selectable | | PENDING | |
| 6 | Public plan shows StatusLane +「开始见面」; participant list updates without refresh tricks that invent roles | | PENDING | |
| 7 | After full;「开始见面」→ result progress; incomplete/failed stay terminal (refresh is not retry) | | PENDING | Record run id / status: |
| 8 | If `completed`: one city, 省钱/省时 only, verified-fare trust copy, no estimates / average fare / booking CTAs | | PENDING | City: |
| 9 | Functional scenes: create/join=静水, plan=密林, result=破晓; no four-clip cycling on those routes | | PENDING | |
| 10 | CDN video: Network shows `media.meetpoint.space`, not ECS origin for MP4 | | PENDING | |
| 11 | Leave-and-finish: after calculate/preview start, close all browsers; with healthy Compose `run-worker` and applied `202607280001`, run reaches terminal or `awaiting_host_confirmation`; worker logs show advances; one open result tab still respects the lease (no double-work) | | PENDING | Operator reminder only — not executed in Task 7. Prerequisites: apply stale-window migration; `docker compose ... up --build -d` so `run-worker` is healthy. |

**Fresh supplier-backed success is desirable but not required to close the China reachability gate.** If coverage ends `incomplete`, confirm zero shared schemes and record the diagnostic; do not publish estimates.

## Public-security filing (outside repository)

| Step | Result | Notes |
| --- | --- | --- |
| Website public-security filing after launch | PENDING | Operator compliance; do not store owner identity/contact in the repo |

## ECS sync note (`/opt/meetpoint` is not a git repo)

If phone check #2 still blanks mid-transition, the live frontend image may predate `74ec1a4`. On the ECS (Workbench/SSH):

```bash
# After syncing the 74ec1a4 tree into /opt/meetpoint (rsync/scp/archive — not git pull)
cd /opt/meetpoint

docker compose \
  --env-file deploy/aliyun/.env.production \
  -f deploy/aliyun/compose.yaml \
  build frontend

docker compose \
  --env-file deploy/aliyun/.env.production \
  -f deploy/aliyun/compose.yaml \
  up -d frontend

docker compose \
  --env-file deploy/aliyun/.env.production \
  -f deploy/aliyun/compose.yaml \
  ps
```

Confirm frontend is `Up` / `healthy` on host loopback `127.0.0.1:3001` only. Confirm `run-worker` is `Up` / `healthy` with no published host port. Do not publish gateway `8080`.

## Cleanup gate (do not run yet)

Only after this document’s phone rows are stable PASS:

1. Inspect Batch B worktrees and the two safety stashes by patch/commit identity.
2. Remove duplicate worktrees/stashes.
3. Optionally merge/push remaining authorized docs.

Until then: keep worktrees/stashes; Xiaomi video hijack stays deferred.
