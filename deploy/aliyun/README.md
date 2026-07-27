# Alibaba Cloud ECS Deployment

This directory packages the verified Next.js frontend and private travel gateway for one Alibaba Cloud mainland ECS instance. The filing domain must remain offline until first ICP approval.

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

Set `NEXT_PUBLIC_SCENIC_BASE_URL=https://media.meetpoint.space` after the scenic MP4 files are uploaded to OSS and that subdomain is attached to Alibaba Cloud CDN. The application keeps same-origin `/scenic/*` paths when this variable is empty, which is useful for local and Vercel verification but is not suitable for the ECS instance's 3 Mbps public bandwidth.

Validate configuration without printing interpolated secrets:

```bash
docker compose \
  --env-file deploy/aliyun/.env.production \
  -f deploy/aliyun/compose.yaml \
  config --quiet
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

## Launch after ICP approval

1. Confirm the shipped footer shows the approved ICP number and links to MIIT.
2. Upload `public/scenic/*.mp4` to the OSS `scenic/` prefix and configure `media.meetpoint.space` through Alibaba Cloud CDN with byte-range support.
3. Install host Nginx and an approved TLS certificate covering `meetpoint.space` and `www.meetpoint.space`.
4. Install `meetpoint.nginx.conf.template` and test with `nginx -t`.
5. Resolve `www` and the apex domain to the ECS public IP; the apex redirects to the filed canonical `www` host.
6. Open only `80` and `443` publicly in the security group; keep `3001` and `8080` closed.
7. Run the complete mainland-phone acceptance before treating production as stable.

Do not remove the Vercel release, old Batch B worktrees, or safety stashes until mainland acceptance is stable.
