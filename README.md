# Cross-City MeetPoint

Mobile-first H5 MVP for choosing a fair cross-city meeting city for 2-6 people in China.

## Scripts

- `npm run dev`
- `npm run lint`
- `npm run test`
- `npm run build`

## Environment

Copy `.env.example` to `.env.local` and fill server-side keys locally.

Supabase variables:

- `NEXT_PUBLIC_SUPABASE_URL`: public Supabase project URL used by browser and server clients.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public anon key for browser-side reads.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service-role key for route handlers and background calculations.
