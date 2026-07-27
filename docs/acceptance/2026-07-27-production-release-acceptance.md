# 2026-07-27 Production Release Acceptance

## Release identity

- Source release commit: `206cd7e7d6faec111c8888a506f314202df5d8b1`.
- `origin/main` advanced linearly from `746e74b` to `206cd7e`; the push was non-forced.
- Vercel project: `lt2236465917-designs-projects/meetpoint` (`Services` preset).
- Production deployment: `dpl_GokZy2rTQAWs6yisiD3E7rBAcD4d`.
- Deployment URL: `https://meetpoint-fip7fag7h-lt2236465917-designs-projects.vercel.app`.
- Current production alias: `https://meetpoint-teal.vercel.app`.
- Vercel built the Next.js frontend and the `travel_gateway` container service. The gateway image tag used source SHA `206cd7e7d6fa`.

## Fresh preflight evidence

The release worktree was clean before integration. The following checks were run from a fresh dependency install:

- Root lint: PASS.
- Root tests: PASS, 74 files / 476 tests.
- Root production build and TypeScript: PASS.
- Gateway lint: PASS.
- Gateway tests: PASS, 7 files / 126 tests.
- Gateway TypeScript build: PASS.

The first root build attempt was blocked by the local sandbox because Turbopack could not bind its worker port. The same `npm run build` command passed outside the sandbox. The first Vercel CLI response ended with a transient container-build `fetch failed`; Vercel subsequently completed the deployment and reported it as `Ready` with all production aliases assigned.

## Production acceptance evidence

Because the local mainland-China network could not reach `*.vercel.app`, public rendering and API checks were repeated from a US remote browser node. No application credential or deployment secret was provided to the remote node.

| Check | Result | Evidence |
| --- | --- | --- |
| Home rendering | PASS outside mainland China | Remote render returned the expected Chinese title and product description. |
| City API | PASS | `GET /api/cities/search?q=上海` returned HTTP 200 with one canonical `上海` result. |
| Create API | PASS | A production acceptance plan was created as `DIF03U`; HTTP 200. |
| Join API | PASS | Two synthetic acceptance participants were submitted; both calls returned HTTP 200. |
| Public plan projection | PASS | `GET /api/plans/DIF03U` returned HTTP 200 with two participants. |
| Completed-result compatibility | PASS | Historical supplier-backed plan `VXYI6G` still returned HTTP 200, three participants, `latestRun.status=completed`, a shared result, and city `hefei`. |
| Mobile create UI | PASS outside mainland China | A real 390×844 remote-browser render showed the adaptive single-column form with no horizontal overflow or covered controls. |
| Mobile result UI | PASS outside mainland China | A real 390×844 render of `/p/VXYI6G/result` showed 合肥, verified-fare trust copy, and the persisted 省钱方案 with participant routes. |
| Scenic video asset | PASS outside mainland China | `/scenic/golden-hour-mobile.mp4` resolved as MP4, 1920×1080, 10 seconds, 8.18 MB. |
| Runtime errors | PASS | `vercel logs --no-branch --environment production --level error --since 1h` returned no errors after acceptance traffic. |

The fresh acceptance did not claim a new supplier-backed recommendation success. An authenticated calculate/advance call would require exposing a participant credential to the third-party remote browser used to bypass the local network restriction, so that step was intentionally not performed. Supplier-backed result compatibility is evidenced by the previously completed plan `VXYI6G`; the latest controlled supplier run remains governed by the Batch B remote acceptance record.

## Blocking production finding

The application is designed for users in China, but the project currently has only Vercel-managed `*.vercel.app` aliases and no custom domain. Direct local production requests timed out. DNS inspection returned unrelated Dropbox/Facebook addresses (`162.125.6.1`, `108.160.166.57`, and `2a03:2880:f131:83:face:b00c:0:25de`) instead of Vercel, and a forced connection to Vercel's general-purpose Anycast address was reset.

This matches Vercel's documented limitation that `.vercel.app` subdomains may be blocked or throttled in mainland China. Therefore:

- The deployment is built, published, and operational outside mainland China.
- Production acceptance for the product's China target audience is **blocked** until a suitable custom domain or a compliant China-reachable hosting strategy is supplied and verified on real mainland mobile networks.
- Old Batch B worktrees and stashes were not cleaned, because the delegated cleanup gate requires a stable production acceptance first.
- Credentials were not rotated or printed. The operator's decision not to rotate credentials remains unchanged.

## Required follow-up

1. Provide and attach a custom domain to the Vercel project, or choose an ICP-compliant China-reachable deployment target.
2. Repeat real mainland phone acceptance for `/`, `/create`, `/p/[code]/join`, `/p/[code]`, and `/p/[code]/result`, including video playback and API requests.
3. Run a fresh supplier-backed plan only when the gateway and supplier coverage are available; incomplete coverage must remain unpublished.
4. After those checks pass, inspect old worktrees and stash contents by patch/commit identity before removing any duplicate state.
