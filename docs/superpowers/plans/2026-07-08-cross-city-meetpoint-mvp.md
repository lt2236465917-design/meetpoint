# Cross-City MeetPoint MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clean mobile-first Next.js H5 MVP for multi-person cross-city meeting city recommendations in China.

**Architecture:** Use `/Users/lixinyu/Desktop/cross-city-meetpoint` as the clean project root. Keep deterministic business logic in typed service modules, isolate external vendors behind provider interfaces, store collaboration data in Supabase, and use DeepSeek only to explain already-computed results.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Supabase, Vitest, Zod, OpenAI-compatible DeepSeek client, Vercel-compatible route handlers.

## Global Constraints

- Platform: Web H5 first, mobile-first UI.
- Participant count: 2-6 people.
- Location granularity: city-level, not exact address-level.
- Cost scope: one-way arrival cost only. Return trips are out of scope for MVP.
- Transport modes: flight, high-speed train/EMU, and normal train.
- Calculation timing: manual calculation, with stale-result warning.
- Direct/transfer policy: check direct options first; if unavailable, try transfer options.
- Arrival window: 0-6 hours early is acceptable; 6-12 hours early is penalized; over 12 hours early or late arrival is excluded from primary recommendations.
- Amap: built-in city library first; Amap only for city search autocomplete and validation.
- LLM: DeepSeek is used for explanation, summaries, risk phrasing, and share copy, not for core scoring or ticket lookup.
- Secrets must stay in server-side environment variables.
- Supabase exposed tables must use RLS.
- Existing reference project folders must not be edited.

---

## File Structure

Implementation project root:

```text
/Users/lixinyu/Desktop/cross-city-meetpoint/
├── AGENTS.md
├── README.md
├── .env.example
├── package.json
├── supabase/
│   └── schema.sql
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── create/page.tsx
│   │   ├── p/[code]/page.tsx
│   │   ├── p/[code]/join/page.tsx
│   │   ├── p/[code]/manage/page.tsx
│   │   ├── p/[code]/result/page.tsx
│   │   └── api/
│   │       ├── plans/route.ts
│   │       ├── plans/[code]/route.ts
│   │       ├── plans/[code]/participants/route.ts
│   │       ├── plans/[code]/candidates/route.ts
│   │       ├── plans/[code]/calculate/route.ts
│   │       ├── plans/[code]/explain/route.ts
│   │       └── cities/search/route.ts
│   ├── components/
│   │   ├── forms/CityCombobox.tsx
│   │   ├── forms/TransportModePicker.tsx
│   │   ├── plan/ParticipantList.tsx
│   │   ├── plan/CandidateCityEditor.tsx
│   │   ├── result/RecommendationCard.tsx
│   │   └── ui/Notice.tsx
│   ├── data/cities.ts
│   ├── lib/
│   │   ├── ai/deepseek-client.ts
│   │   ├── ai/recommendation-explainer.ts
│   │   ├── city/candidate-generator.ts
│   │   ├── city/city-provider.ts
│   │   ├── city/distance.ts
│   │   ├── recommendation/calculate-run.ts
│   │   ├── recommendation/scoring.ts
│   │   ├── security/management-token.ts
│   │   ├── security/tokens.ts
│   │   ├── supabase/client.ts
│   │   ├── supabase/server.ts
│   │   ├── travel/estimate-provider.ts
│   │   ├── travel/flyai-provider.ts
│   │   ├── travel/types.ts
│   │   └── validation/schemas.ts
│   └── types/domain.ts
└── tests/
    ├── candidate-generator.test.ts
    ├── plan-route.test.ts
    ├── scoring.test.ts
    ├── tokens.test.ts
    └── management-token.test.ts
```

---

### Task 1: Scaffold Clean Next.js Project And Rules

**Files:**
- Create: `cross-city-meetpoint/`
- Create: `cross-city-meetpoint/AGENTS.md`
- Create: `cross-city-meetpoint/.env.example`
- Create: `cross-city-meetpoint/README.md`
- Modify: `cross-city-meetpoint/package.json`
- Create: `cross-city-meetpoint/vitest.config.ts`

**Interfaces:**
- Produces: a runnable Next.js project with `npm run lint`, `npm run build`, and `npm run test`.

- [x] **Step 1: Scaffold the project**

Run from the parent directory of the implementation root:

```bash
npx create-next-app@latest cross-city-meetpoint --ts --eslint --tailwind --app --src-dir --import-alias "@/*"
```

Expected: a new `cross-city-meetpoint/` directory.

- [x] **Step 2: Install runtime and test dependencies**

Run:

```bash
cd /Users/lixinyu/Desktop/cross-city-meetpoint
npm install @supabase/supabase-js zod openai
npm install -D vitest @vitest/ui
```

Expected: dependencies are added to `package.json`.

- [x] **Step 3: Modify `package.json` scripts**

Set the scripts to include:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [x] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [x] **Step 5: Create project `AGENTS.md`**

```md
# Project Rules

## Product

This project is a mobile-first Web H5 app for multi-person cross-city meeting planning in China.

## Development

- Use Chinese for user-facing copy.
- Use English for code, files, variables, and commit messages.
- Keep ticket lookup, city ranking, and scoring deterministic.
- Use DeepSeek only for explanation, risk summaries, and share text.
- Keep secrets in server-side environment variables only.
- Run `npm run lint`, `npm run test`, and `npm run build` before reporting completion after code changes.

## Structure

- `src/lib/travel/`: vendor adapters and normalized travel option types.
- `src/lib/recommendation/`: deterministic scoring and calculation orchestration.
- `src/lib/city/`: city search, distance, and candidate generation.
- `src/lib/ai/`: DeepSeek explanation helpers.
- `src/components/`: mobile-first UI components.
```

- [x] **Step 6: Create `.env.example`**

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AMAP_API_KEY=
DEEPSEEK_API_KEY=
FLYAI_API_KEY=
FLYAI_CLI_PATH=
```

- [x] **Step 7: Create `README.md`**

```md
# Cross-City MeetPoint

Mobile-first H5 MVP for choosing a fair cross-city meeting city for 2-6 people in China.

## Scripts

- `npm run dev`
- `npm run lint`
- `npm run test`
- `npm run build`

## Environment

Copy `.env.example` to `.env.local` and fill server-side keys locally.
```

- [x] **Step 8: Verify scaffold**

Run:

```bash
npm run lint
npm run test
npm run build
```

Expected: lint and build pass; Vitest exits non-zero because no tests exist until Task 2 adds `tests/**/*.test.ts`.

- [x] **Step 9: Commit**

```bash
git init
git add .
git commit -m "chore: scaffold cross-city meetpoint app"
```

---

### Task 2: Domain Types, Validation Schemas, And Token Utilities

**Files:**
- Create: `cross-city-meetpoint/src/types/domain.ts`
- Create: `cross-city-meetpoint/src/lib/validation/schemas.ts`
- Create: `cross-city-meetpoint/src/lib/security/tokens.ts`
- Test: `cross-city-meetpoint/tests/tokens.test.ts`

**Interfaces:**
- Produces: `TransportMode`, `PlanStatus`, `TravelOption`, `CityRecommendation`, Zod schemas, `generateToken()`, `hashToken(token)`, `verifyToken(token, hash)`.

- [x] **Step 1: Write failing token tests**

Create `tests/tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateToken, hashToken, verifyToken } from "@/lib/security/tokens";

describe("token utilities", () => {
  it("generates url-safe high-entropy tokens", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });

  it("verifies a matching token and rejects a different token", async () => {
    const token = "host-secret-token";
    const hash = await hashToken(token);
    await expect(verifyToken(token, hash)).resolves.toBe(true);
    await expect(verifyToken("wrong-token", hash)).resolves.toBe(false);
  });
});
```

- [x] **Step 2: Run test and verify failure**

Run:

```bash
npm run test -- tests/tokens.test.ts
```

Expected: FAIL because `@/lib/security/tokens` does not exist.

- [x] **Step 3: Create domain types**

Create `src/types/domain.ts`:

```ts
export type TransportMode = "flight" | "high_speed_rail" | "normal_train";

export type PlanStatus = "draft" | "collecting" | "ready" | "calculating" | "completed";

export type TravelSource = "real" | "estimated" | "unavailable";

export type TravelProviderName = "flyai" | "amap" | "estimate";

export type City = {
  code: string;
  name: string;
  province: string;
  lat: number;
  lng: number;
  isProvincialCapital?: boolean;
  isMunicipality?: boolean;
  isAirportHub?: boolean;
  isRailHub?: boolean;
};

export type ParticipantInput = {
  name: string;
  departureCityCode: string;
  departureCityName: string;
  acceptedModes: TransportMode[];
};

export type TravelOption = {
  participantId: string;
  candidateCityCode: string;
  mode: TransportMode;
  source: TravelSource;
  provider: TravelProviderName;
  priceCny: number | null;
  departAt: string | null;
  arriveAt: string | null;
  durationMinutes: number | null;
  waitMinutes: number | null;
  isDirect: boolean;
  hasTransfer: boolean;
  transferCount: number;
  bookingUrl: string | null;
  failureReason: string | null;
};

export type CityRecommendation = {
  cityCode: string;
  cityName: string;
  totalPriceCny: number;
  avgPriceCny: number;
  totalDurationMinutes: number;
  fairnessGap: number;
  waitingPenalty: number;
  transferPenalty: number;
  estimatePenalty: number;
  missingPenalty: number;
  scoreCheapest: number;
  scoreBalanced: number;
  scoreFastest: number;
  labels: Array<"cheapest" | "balanced" | "fastest">;
  explanation?: string;
  riskSummary?: string;
};
```

- [x] **Step 4: Create validation schemas**

Create `src/lib/validation/schemas.ts`:

```ts
import { z } from "zod";

export const transportModeSchema = z.enum(["flight", "high_speed_rail", "normal_train"]);

export const createPlanSchema = z.object({
  title: z.string().trim().min(1).max(60),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetArrivalTime: z.string().regex(/^\d{2}:\d{2}$/),
  participantLimit: z.number().int().min(2).max(6),
});

export const participantInputSchema = z.object({
  name: z.string().trim().min(1).max(20),
  departureCityCode: z.string().trim().min(1).max(24),
  departureCityName: z.string().trim().min(1).max(24),
  acceptedModes: z.array(transportModeSchema).min(1).max(3),
});

export const candidateCityInputSchema = z.object({
  cityCode: z.string().trim().min(1).max(24),
  cityName: z.string().trim().min(1).max(24),
  enabled: z.boolean(),
});
```

- [x] **Step 5: Create token utilities**

Create `src/lib/security/tokens.ts`:

```ts
import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function generateToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export async function hashToken(token: string): Promise<string> {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifyToken(token: string, hash: string): Promise<boolean> {
  const actual = Buffer.from(await hashToken(token), "hex");
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
```

- [x] **Step 6: Run tests**

Run:

```bash
npm run test -- tests/tokens.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/types/domain.ts src/lib/validation/schemas.ts src/lib/security/tokens.ts tests/tokens.test.ts
git commit -m "feat: add domain contracts and token utilities"
```

---

### Task 3: Built-In City Library, Distance, And Candidate Generation

**Files:**
- Create: `cross-city-meetpoint/src/data/cities.ts`
- Create: `cross-city-meetpoint/src/lib/city/distance.ts`
- Create: `cross-city-meetpoint/src/lib/city/candidate-generator.ts`
- Test: `cross-city-meetpoint/tests/candidate-generator.test.ts`

**Interfaces:**
- Consumes: `City` from `src/types/domain.ts`.
- Produces: `findCityByCode(code)`, `searchLocalCities(query)`, `haversineKm(a, b)`, `generateCandidateCities(input)`.

- [x] **Step 1: Write failing candidate generator tests**

Create `tests/candidate-generator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateCandidateCities } from "@/lib/city/candidate-generator";

describe("generateCandidateCities", () => {
  it("includes departure cities, host additions, hubs, and excludes manual removals", () => {
    const candidates = generateCandidateCities({
      departureCityCodes: ["beijing", "shanghai", "guangzhou"],
      manualAddCityCodes: ["wuhan"],
      manualExcludeCityCodes: ["shanghai"],
      limit: 8,
    });

    const codes = candidates.map((city) => city.code);
    expect(codes).toContain("beijing");
    expect(codes).toContain("guangzhou");
    expect(codes).toContain("wuhan");
    expect(codes).not.toContain("shanghai");
    expect(codes.length).toBeLessThanOrEqual(8);
  });
});
```

- [x] **Step 2: Run test and verify failure**

Run:

```bash
npm run test -- tests/candidate-generator.test.ts
```

Expected: FAIL because city modules do not exist.

- [x] **Step 3: Create city data**

Create `src/data/cities.ts`:

```ts
import type { City } from "@/types/domain";

export const CITIES: City[] = [
  { code: "beijing", name: "北京", province: "北京", lat: 39.9042, lng: 116.4074, isMunicipality: true, isAirportHub: true, isRailHub: true },
  { code: "shanghai", name: "上海", province: "上海", lat: 31.2304, lng: 121.4737, isMunicipality: true, isAirportHub: true, isRailHub: true },
  { code: "guangzhou", name: "广州", province: "广东", lat: 23.1291, lng: 113.2644, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "shenzhen", name: "深圳", province: "广东", lat: 22.5431, lng: 114.0579, isAirportHub: true, isRailHub: true },
  { code: "wuhan", name: "武汉", province: "湖北", lat: 30.5928, lng: 114.3055, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "changsha", name: "长沙", province: "湖南", lat: 28.2282, lng: 112.9388, isProvincialCapital: true, isRailHub: true },
  { code: "hangzhou", name: "杭州", province: "浙江", lat: 30.2741, lng: 120.1551, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "nanjing", name: "南京", province: "江苏", lat: 32.0603, lng: 118.7969, isProvincialCapital: true, isRailHub: true },
  { code: "zhengzhou", name: "郑州", province: "河南", lat: 34.7466, lng: 113.6254, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "xian", name: "西安", province: "陕西", lat: 34.3416, lng: 108.9398, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "chengdu", name: "成都", province: "四川", lat: 30.5728, lng: 104.0668, isProvincialCapital: true, isAirportHub: true, isRailHub: true },
  { code: "chongqing", name: "重庆", province: "重庆", lat: 29.563, lng: 106.5516, isMunicipality: true, isAirportHub: true, isRailHub: true },
];

export function findCityByCode(code: string): City | undefined {
  return CITIES.find((city) => city.code === code);
}

export function searchLocalCities(query: string): City[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return CITIES.filter((city) => {
    return city.code.includes(normalized) || city.name.includes(query.trim());
  }).slice(0, 8);
}
```

- [x] **Step 4: Create distance utility**

Create `src/lib/city/distance.ts`:

```ts
type Coordinate = { lat: number; lng: number };

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineKm(a: Coordinate, b: Coordinate): number {
  const radiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
```

- [x] **Step 5: Create candidate generator**

Create `src/lib/city/candidate-generator.ts`:

```ts
import { CITIES, findCityByCode } from "@/data/cities";
import type { City } from "@/types/domain";
import { haversineKm } from "./distance";

export type GenerateCandidateCitiesInput = {
  departureCityCodes: string[];
  manualAddCityCodes?: string[];
  manualExcludeCityCodes?: string[];
  limit?: number;
};

function cityScore(city: City, midpoint: { lat: number; lng: number }): number {
  const hubBonus =
    (city.isAirportHub ? 150 : 0) +
    (city.isRailHub ? 180 : 0) +
    (city.isProvincialCapital ? 80 : 0) +
    (city.isMunicipality ? 100 : 0);
  return haversineKm(city, midpoint) - hubBonus;
}

export function generateCandidateCities(input: GenerateCandidateCitiesInput): City[] {
  const limit = input.limit ?? 12;
  const manualExclude = new Set(input.manualExcludeCityCodes ?? []);
  const departureCities = input.departureCityCodes
    .map(findCityByCode)
    .filter((city): city is City => Boolean(city));

  const midpoint = departureCities.length
    ? {
        lat: departureCities.reduce((sum, city) => sum + city.lat, 0) / departureCities.length,
        lng: departureCities.reduce((sum, city) => sum + city.lng, 0) / departureCities.length,
      }
    : { lat: 30.5928, lng: 114.3055 };

  const map = new Map<string, City>();
  for (const city of departureCities) map.set(city.code, city);
  for (const code of input.manualAddCityCodes ?? []) {
    const city = findCityByCode(code);
    if (city) map.set(city.code, city);
  }

  const hubs = CITIES
    .filter((city) => city.isAirportHub || city.isRailHub || city.isProvincialCapital || city.isMunicipality)
    .sort((a, b) => cityScore(a, midpoint) - cityScore(b, midpoint));

  for (const city of hubs) {
    if (map.size >= limit + manualExclude.size) break;
    map.set(city.code, city);
  }

  return Array.from(map.values())
    .filter((city) => !manualExclude.has(city.code))
    .slice(0, limit);
}
```

- [x] **Step 6: Run tests**

Run:

```bash
npm run test -- tests/candidate-generator.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/data/cities.ts src/lib/city/distance.ts src/lib/city/candidate-generator.ts tests/candidate-generator.test.ts
git commit -m "feat: add city library and candidate generation"
```

---

### Task 4: Supabase Schema, Clients, And RLS Draft

**Files:**
- Create: `cross-city-meetpoint/supabase/schema.sql`
- Create: `cross-city-meetpoint/src/lib/supabase/client.ts`
- Create: `cross-city-meetpoint/src/lib/supabase/server.ts`

**Interfaces:**
- Produces: browser Supabase client, service-role server Supabase client, database schema matching the spec.

- [x] **Step 1: Create `supabase/schema.sql`**

```sql
create extension if not exists pgcrypto;

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  meeting_date date not null,
  target_arrival_time text not null,
  participant_limit integer not null check (participant_limit between 2 and 6),
  management_token_hash text not null,
  status text not null default 'collecting',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_calculated_at timestamptz
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  name text not null,
  departure_city_code text not null,
  departure_city_name text not null,
  accepted_modes text[] not null,
  edit_token_hash text not null,
  created_by_host boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists candidate_cities (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  city_code text not null,
  city_name text not null,
  source text not null check (source in ('system', 'manual_add', 'manual_exclude')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(plan_id, city_code, source)
);

create table if not exists recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'partial')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  stale_after timestamptz,
  error_summary text
);

create table if not exists travel_options (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references recommendation_runs(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  candidate_city_code text not null,
  mode text not null,
  source text not null check (source in ('real', 'estimated', 'unavailable')),
  provider text not null,
  price_cny integer,
  depart_at timestamptz,
  arrive_at timestamptz,
  duration_minutes integer,
  wait_minutes integer,
  is_direct boolean not null default false,
  has_transfer boolean not null default false,
  transfer_count integer not null default 0,
  booking_url text,
  failure_reason text,
  raw_payload_ref text
);

create table if not exists city_recommendations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references recommendation_runs(id) on delete cascade,
  city_code text not null,
  city_name text not null,
  total_price_cny integer not null,
  avg_price_cny integer not null,
  total_duration_minutes integer not null,
  fairness_gap integer not null,
  waiting_penalty integer not null,
  transfer_penalty integer not null,
  estimate_penalty integer not null,
  missing_penalty integer not null,
  score_cheapest integer not null,
  score_balanced integer not null,
  score_fastest integer not null,
  labels text[] not null default '{}',
  explanation text,
  risk_summary text
);

create table if not exists ai_explanations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references recommendation_runs(id) on delete cascade,
  city_recommendation_id uuid references city_recommendations(id) on delete cascade,
  model text not null,
  input_hash text not null,
  output_json jsonb not null,
  created_at timestamptz not null default now()
);

alter table plans enable row level security;
alter table participants enable row level security;
alter table candidate_cities enable row level security;
alter table recommendation_runs enable row level security;
alter table travel_options enable row level security;
alter table city_recommendations enable row level security;
alter table ai_explanations enable row level security;

create policy "public read plan by code" on plans for select using (true);
create policy "public read participants" on participants for select using (true);
create policy "public read candidate cities" on candidate_cities for select using (true);
create policy "public read runs" on recommendation_runs for select using (true);
create policy "public read travel options" on travel_options for select using (true);
create policy "public read city recommendations" on city_recommendations for select using (true);

alter publication supabase_realtime add table participants;
alter publication supabase_realtime add table candidate_cities;
alter publication supabase_realtime add table recommendation_runs;
alter publication supabase_realtime add table city_recommendations;
```

- [x] **Step 2: Create browser Supabase client**

Create `src/lib/supabase/client.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Missing public Supabase environment variables");
  return createClient(url, anonKey);
}
```

- [x] **Step 3: Create server Supabase client**

Create `src/lib/supabase/server.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

export function createServiceSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Missing server Supabase environment variables");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
```

- [x] **Step 4: Verify TypeScript**

Run:

```bash
npm run lint
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add supabase/schema.sql src/lib/supabase/client.ts src/lib/supabase/server.ts
git commit -m "feat: add supabase schema and clients"
```

---

### Task 5: Plan Creation API And Create Page

**Files:**
- Create: `cross-city-meetpoint/src/app/api/plans/route.ts`
- Create: `cross-city-meetpoint/src/app/create/page.tsx`
- Modify: `cross-city-meetpoint/src/app/page.tsx`
- Test: `cross-city-meetpoint/tests/plan-route.test.ts`

**Interfaces:**
- Consumes: `createPlanSchema`, `generateToken`, `hashToken`, service Supabase client.
- Produces: `POST /api/plans` returning `{ code: string; manageToken: string; shareUrl: string }`.

- [x] **Step 1: Create plan API**

Create `src/app/api/plans/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createPlanSchema } from "@/lib/validation/schemas";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = createPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const code = generateCode();
  const manageToken = generateToken();
  const managementTokenHash = await hashToken(manageToken);

  const { error } = await supabase.from("plans").insert({
    code,
    title: parsed.data.title,
    meeting_date: parsed.data.meetingDate,
    target_arrival_time: parsed.data.targetArrivalTime,
    participant_limit: parsed.data.participantLimit,
    management_token_hash: managementTokenHash,
    status: "collecting",
  });

  if (error) {
    console.error("create plan error", error);
    return NextResponse.json({ error: "CREATE_PLAN_FAILED" }, { status: 500 });
  }

  return NextResponse.json({
    code,
    manageToken,
    shareUrl: `/p/${code}`,
  });
}
```

- [x] **Step 2: Create mobile-first create page**

Create `src/app/create/page.tsx`:

```tsx
"use client";

import { useState } from "react";

export default function CreatePlanPage() {
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [targetArrivalTime, setTargetArrivalTime] = useState("18:00");
  const [participantLimit, setParticipantLimit] = useState(4);
  const [result, setResult] = useState<{ code: string; manageToken: string; shareUrl: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, meetingDate, targetArrivalTime, participantLimit }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "创建失败");
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-white px-5 py-6">
      <h1 className="text-2xl font-semibold text-gray-950">创建见面计划</h1>
      <p className="mt-2 text-sm text-gray-500">先填最少信息，发给朋友后再一起补全。</p>

      <div className="mt-6 space-y-4">
        <input className="w-full rounded-lg border px-4 py-3" placeholder="计划名称" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="w-full rounded-lg border px-4 py-3" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
        <input className="w-full rounded-lg border px-4 py-3" type="time" value={targetArrivalTime} onChange={(e) => setTargetArrivalTime(e.target.value)} />
        <input className="w-full rounded-lg border px-4 py-3" type="number" min={2} max={6} value={participantLimit} onChange={(e) => setParticipantLimit(Number(e.target.value))} />
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button className="w-full rounded-lg bg-black py-3 font-medium text-white disabled:opacity-60" disabled={loading} onClick={submit}>
          {loading ? "创建中" : "创建并生成链接"}
        </button>
      </div>

      {result && (
        <section className="mt-6 rounded-xl border bg-gray-50 p-4">
          <p className="text-sm font-medium">公开链接：{result.shareUrl}</p>
          <p className="mt-2 text-sm font-medium">管理口令：{result.manageToken}</p>
          <p className="mt-2 text-xs text-gray-500">请保存管理口令，后续编辑和计算需要它。</p>
        </section>
      )}
    </main>
  );
}
```

- [x] **Step 3: Replace home page with creation entry**

Modify `src/app/page.tsx`:

```tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-white px-5">
      <h1 className="text-3xl font-semibold tracking-tight text-gray-950">多人异地见面，先算去哪座城</h1>
      <p className="mt-4 text-base leading-7 text-gray-600">
        收集每个人的出发城市和交通偏好，比较机票和高铁火车成本，生成省钱、均衡、省时三档建议。
      </p>
      <Link className="mt-8 rounded-lg bg-black py-3 text-center font-medium text-white" href="/create">
        创建见面计划
      </Link>
    </main>
  );
}
```

- [x] **Step 4: Verify**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/app/api/plans/route.ts src/app/create/page.tsx src/app/page.tsx tests/plan-route.test.ts
git commit -m "feat: add plan creation flow"
```

---

### Task 6: City Search API, Participant Submission API, And Join Page

**Files:**
- Create: `cross-city-meetpoint/src/app/api/cities/search/route.ts`
- Create: `cross-city-meetpoint/src/app/api/plans/[code]/participants/route.ts`
- Create: `cross-city-meetpoint/src/components/forms/TransportModePicker.tsx`
- Create: `cross-city-meetpoint/src/components/forms/CityCombobox.tsx`
- Create: `cross-city-meetpoint/src/app/p/[code]/join/page.tsx`

**Interfaces:**
- Consumes: `participantInputSchema`, token utilities, local city search, city provider.
- Produces: `GET /api/cities/search?q=...` returning `{ cities: Array<{ code: string; name: string; province: string }> }`.
- Produces: `POST /api/plans/[code]/participants` returning `{ participantId: string; editToken: string }`.

- [x] **Step 1: Create city search API**

Create `src/app/api/cities/search/route.ts`:

```ts
import { NextResponse } from "next/server";
import { searchCities } from "@/lib/city/city-provider";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const cities = await searchCities(q);
  return NextResponse.json({
    cities: cities.map((city) => ({
      code: city.code,
      name: city.name,
      province: city.province,
    })),
  });
}
```

- [x] **Step 2: Create transport mode picker**

Create `src/components/forms/TransportModePicker.tsx`:

```tsx
"use client";

import type { TransportMode } from "@/types/domain";

const modes: Array<{ value: TransportMode; label: string }> = [
  { value: "flight", label: "飞机" },
  { value: "high_speed_rail", label: "高铁/动车" },
  { value: "normal_train", label: "普速火车" },
];

export function TransportModePicker({
  value,
  onChange,
}: {
  value: TransportMode[];
  onChange: (value: TransportMode[]) => void;
}) {
  function toggle(mode: TransportMode) {
    onChange(value.includes(mode) ? value.filter((item) => item !== mode) : [...value, mode]);
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {modes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          onClick={() => toggle(mode.value)}
          className={`rounded-lg border px-3 py-3 text-sm ${value.includes(mode.value) ? "border-black bg-black text-white" : "border-gray-200 bg-white text-gray-700"}`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
```

- [x] **Step 3: Create city combobox**

Create `src/components/forms/CityCombobox.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { searchLocalCities } from "@/data/cities";

export function CityCombobox({
  value,
  onChange,
}: {
  value: { code: string; name: string } | null;
  onChange: (city: { code: string; name: string }) => void;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const results = useMemo(() => searchLocalCities(query), [query]);

  return (
    <div className="relative">
      <input className="w-full rounded-lg border px-4 py-3" placeholder="出发城市" value={query} onChange={(event) => setQuery(event.target.value)} />
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border bg-white shadow-lg">
          {results.map((city) => (
            <button
              type="button"
              className="block w-full px-4 py-3 text-left text-sm hover:bg-gray-50"
              key={city.code}
              onClick={() => {
                setQuery(city.name);
                onChange({ code: city.code, name: city.name });
              }}
            >
              {city.name} · {city.province}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [x] **Step 4: Create participant API**

Create `src/app/api/plans/[code]/participants/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { participantInputSchema } from "@/lib/validation/schemas";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const body = await req.json().catch(() => ({}));
  const parsed = participantInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase.from("plans").select("id, participant_limit").eq("code", params.code).single();
  if (!plan) return NextResponse.json({ error: "PLAN_NOT_FOUND" }, { status: 404 });

  const { count } = await supabase.from("participants").select("id", { count: "exact", head: true }).eq("plan_id", plan.id);
  if ((count ?? 0) >= plan.participant_limit) {
    return NextResponse.json({ error: "PARTICIPANT_LIMIT_REACHED" }, { status: 409 });
  }

  const editToken = generateToken();
  const editTokenHash = await hashToken(editToken);
  const { data, error } = await supabase
    .from("participants")
    .insert({
      plan_id: plan.id,
      name: parsed.data.name,
      departure_city_code: parsed.data.departureCityCode,
      departure_city_name: parsed.data.departureCityName,
      accepted_modes: parsed.data.acceptedModes,
      edit_token_hash: editTokenHash,
      created_by_host: false,
    })
    .select("id")
    .single();

  if (error || !data) return NextResponse.json({ error: "CREATE_PARTICIPANT_FAILED" }, { status: 500 });
  return NextResponse.json({ participantId: data.id, editToken });
}
```

- [x] **Step 5: Create join page**

Create `src/app/p/[code]/join/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { TransportMode } from "@/types/domain";
import { CityCombobox } from "@/components/forms/CityCombobox";
import { TransportModePicker } from "@/components/forms/TransportModePicker";

export default function JoinPlanPage({ params }: { params: { code: string } }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState<{ code: string; name: string } | null>(null);
  const [acceptedModes, setAcceptedModes] = useState<TransportMode[]>(["high_speed_rail"]);
  const [message, setMessage] = useState("");

  async function submit() {
    if (!city) {
      setMessage("请选择出发城市");
      return;
    }
    const res = await fetch(`/api/plans/${params.code}/participants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        departureCityCode: city.code,
        departureCityName: city.name,
        acceptedModes,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      localStorage.setItem(`participant:${params.code}`, JSON.stringify(json));
      setMessage("已提交，可以返回计划页查看进度。");
    } else {
      setMessage(json.error || "提交失败");
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-white px-5 py-6">
      <h1 className="text-2xl font-semibold">填写出发信息</h1>
      <div className="mt-6 space-y-4">
        <input className="w-full rounded-lg border px-4 py-3" placeholder="你的名字" value={name} onChange={(event) => setName(event.target.value)} />
        <CityCombobox value={city} onChange={setCity} />
        <TransportModePicker value={acceptedModes} onChange={setAcceptedModes} />
        <button className="w-full rounded-lg bg-black py-3 text-white" onClick={submit}>提交</button>
        {message && <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{message}</p>}
      </div>
    </main>
  );
}
```

- [x] **Step 6: Verify**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS.

Actual in Codex sandbox on 2026-07-08:
- `npm run lint`: PASS.
- `npm run test`: PASS.
- `./node_modules/.bin/tsc --noEmit`: PASS.
- `npm run build`: blocked in the default sandbox by Turbopack process/port binding restriction (`Operation not permitted`), then PASS after approval to run outside the sandbox.

- [x] **Step 7: Commit**

```bash
git add src/app/api/cities/search/route.ts src/app/api/plans/[code]/participants/route.ts src/components/forms/TransportModePicker.tsx src/components/forms/CityCombobox.tsx src/app/p/[code]/join/page.tsx
git commit -m "feat: add participant join flow"
```

---

### Task 6.5: Management Token Checks And Candidate City Editing

**Files:**
- Create: `cross-city-meetpoint/src/lib/security/management-token.ts`
- Create: `cross-city-meetpoint/src/app/api/plans/[code]/candidates/route.ts`
- Create: `cross-city-meetpoint/src/components/plan/CandidateCityEditor.tsx`
- Test: `cross-city-meetpoint/tests/management-token.test.ts`

**Interfaces:**
- Consumes: `verifyToken`, `candidateCityInputSchema`, service Supabase client.
- Produces: `verifyManagementTokenForPlan(code, token): Promise<{ ok: true; planId: string } | { ok: false; status: number; error: string }>`
- Produces: `GET /api/plans/[code]/candidates` and `POST /api/plans/[code]/candidates`.

- [x] **Step 1: Write failing management token test**

Create `tests/management-token.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashToken, verifyToken } from "@/lib/security/tokens";

describe("management token verification primitive", () => {
  it("accepts the original token and rejects another token", async () => {
    const hash = await hashToken("manage-secret");
    await expect(verifyToken("manage-secret", hash)).resolves.toBe(true);
    await expect(verifyToken("other-secret", hash)).resolves.toBe(false);
  });
});
```

- [x] **Step 2: Run test and verify failure if token module is missing**

Run:

```bash
npm run test -- tests/management-token.test.ts
```

Expected: PASS if Task 2 is complete.

- [x] **Step 3: Create management token helper**

Create `src/lib/security/management-token.ts`:

```ts
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { verifyToken } from "./tokens";

export type ManagementTokenResult =
  | { ok: true; planId: string }
  | { ok: false; status: number; error: string };

export async function verifyManagementTokenForPlan(code: string, token: string | null): Promise<ManagementTokenResult> {
  if (!token) return { ok: false, status: 401, error: "MANAGEMENT_TOKEN_REQUIRED" };

  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("id, management_token_hash")
    .eq("code", code)
    .single();

  if (!plan) return { ok: false, status: 404, error: "PLAN_NOT_FOUND" };

  const valid = await verifyToken(token, plan.management_token_hash);
  if (!valid) return { ok: false, status: 403, error: "INVALID_MANAGEMENT_TOKEN" };

  return { ok: true, planId: plan.id };
}
```

- [x] **Step 4: Create candidate city API**

Create `src/app/api/plans/[code]/candidates/route.ts`:

```ts
import { NextResponse } from "next/server";
import { candidateCityInputSchema } from "@/lib/validation/schemas";
import { verifyManagementTokenForPlan } from "@/lib/security/management-token";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

function getManagementToken(req: Request): string | null {
  return req.headers.get("x-management-token");
}

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase.from("plans").select("id").eq("code", params.code).single();
  if (!plan) return NextResponse.json({ error: "PLAN_NOT_FOUND" }, { status: 404 });
  const { data } = await supabase.from("candidate_cities").select("*").eq("plan_id", plan.id);
  return NextResponse.json({ candidates: data ?? [] });
}

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const verified = await verifyManagementTokenForPlan(params.code, getManagementToken(req));
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status });

  const body = await req.json().catch(() => ({}));
  const parsed = candidateCityInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const supabase = createServiceSupabaseClient();
  const source = parsed.data.enabled ? "manual_add" : "manual_exclude";
  const { error } = await supabase.from("candidate_cities").upsert(
    {
      plan_id: verified.planId,
      city_code: parsed.data.cityCode,
      city_name: parsed.data.cityName,
      source,
      enabled: parsed.data.enabled,
    },
    { onConflict: "plan_id,city_code,source" },
  );

  if (error) return NextResponse.json({ error: "SAVE_CANDIDATE_FAILED" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [x] **Step 5: Create candidate city editor component**

Create `src/components/plan/CandidateCityEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { CityCombobox } from "@/components/forms/CityCombobox";

export function CandidateCityEditor({
  code,
  managementToken,
}: {
  code: string;
  managementToken: string;
}) {
  const [city, setCity] = useState<{ code: string; name: string } | null>(null);
  const [message, setMessage] = useState("");

  async function save(enabled: boolean) {
    if (!city) {
      setMessage("请先选择城市");
      return;
    }
    const res = await fetch(`/api/plans/${code}/candidates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-management-token": managementToken,
      },
      body: JSON.stringify({
        cityCode: city.code,
        cityName: city.name,
        enabled,
      }),
    });
    const json = await res.json();
    setMessage(res.ok ? "已保存候选城市设置" : json.error || "保存失败");
  }

  return (
    <section className="rounded-xl border p-4">
      <h2 className="font-medium">候选城市</h2>
      <div className="mt-3">
        <CityCombobox value={city} onChange={setCity} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="rounded-lg bg-black py-2 text-sm text-white" onClick={() => save(true)}>添加</button>
        <button className="rounded-lg border py-2 text-sm" onClick={() => save(false)}>排除</button>
      </div>
      {message && <p className="mt-3 text-sm text-gray-500">{message}</p>}
    </section>
  );
}
```

- [x] **Step 6: Verify**

Run:

```bash
npm run lint
npm run test -- tests/management-token.test.ts
npm run build
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/lib/security/management-token.ts src/app/api/plans/[code]/candidates/route.ts src/components/plan/CandidateCityEditor.tsx tests/management-token.test.ts
git commit -m "feat: add management token and candidate editing"
```

---

### Task 7: Scoring Engine And Estimate Provider

**Files:**
- Create: `cross-city-meetpoint/src/lib/travel/types.ts`
- Create: `cross-city-meetpoint/src/lib/travel/estimate-provider.ts`
- Create: `cross-city-meetpoint/src/lib/recommendation/scoring.ts`
- Test: `cross-city-meetpoint/tests/scoring.test.ts`

**Interfaces:**
- Consumes: `TravelOption`, `CityRecommendation`.
- Produces: `estimateTravelOption(input)`, `scoreCandidateCity(input)`, `pickPrimaryRecommendations(recommendations)`.

- [x] **Step 1: Write failing scoring tests**

Create `tests/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scoreCandidateCity } from "@/lib/recommendation/scoring";
import type { TravelOption } from "@/types/domain";

const baseOption: TravelOption = {
  participantId: "p1",
  candidateCityCode: "wuhan",
  mode: "high_speed_rail",
  source: "real",
  provider: "flyai",
  priceCny: 300,
  departAt: "2026-08-01T08:00:00+08:00",
  arriveAt: "2026-08-01T12:00:00+08:00",
  durationMinutes: 240,
  waitMinutes: 360,
  isDirect: true,
  hasTransfer: false,
  transferCount: 0,
  bookingUrl: null,
  failureReason: null,
};

describe("scoreCandidateCity", () => {
  it("penalizes estimates, transfers, and unavailable options", () => {
    const recommendation = scoreCandidateCity({
      cityCode: "wuhan",
      cityName: "武汉",
      options: [
        baseOption,
        { ...baseOption, participantId: "p2", source: "estimated", provider: "estimate", priceCny: 500 },
        { ...baseOption, participantId: "p3", hasTransfer: true, transferCount: 1, isDirect: false },
        { ...baseOption, participantId: "p4", source: "unavailable", priceCny: null, durationMinutes: null },
      ],
    });

    expect(recommendation.totalPriceCny).toBe(1100);
    expect(recommendation.estimatePenalty).toBeGreaterThan(0);
    expect(recommendation.transferPenalty).toBeGreaterThan(0);
    expect(recommendation.missingPenalty).toBeGreaterThan(0);
  });
});
```

- [x] **Step 2: Run test and verify failure**

Run:

```bash
npm run test -- tests/scoring.test.ts
```

Expected: FAIL because scoring module does not exist.

- [x] **Step 3: Create travel provider types**

Create `src/lib/travel/types.ts`:

```ts
import type { TransportMode, TravelOption } from "@/types/domain";

export type TravelSearchInput = {
  participantId: string;
  originCityCode: string;
  originCityName: string;
  destinationCityCode: string;
  destinationCityName: string;
  meetingDate: string;
  targetArrivalTime: string;
  acceptedModes: TransportMode[];
};

export type TravelProvider = {
  search(input: TravelSearchInput): Promise<TravelOption[]>;
};
```

- [x] **Step 4: Create estimate provider**

Create `src/lib/travel/estimate-provider.ts`:

```ts
import { findCityByCode } from "@/data/cities";
import { haversineKm } from "@/lib/city/distance";
import type { TravelOption, TransportMode } from "@/types/domain";
import type { TravelSearchInput } from "./types";

function estimatePrice(distanceKm: number, mode: TransportMode): number {
  if (mode === "flight") return Math.max(380, Math.round(distanceKm * 0.55));
  if (mode === "high_speed_rail") return Math.max(80, Math.round(distanceKm * 0.46));
  return Math.max(45, Math.round(distanceKm * 0.18));
}

function estimateDuration(distanceKm: number, mode: TransportMode): number {
  if (mode === "flight") return Math.round(distanceKm / 700 * 60 + 120);
  if (mode === "high_speed_rail") return Math.round(distanceKm / 240 * 60);
  return Math.round(distanceKm / 80 * 60);
}

export function estimateTravelOption(input: TravelSearchInput, mode: TransportMode): TravelOption {
  const origin = findCityByCode(input.originCityCode);
  const destination = findCityByCode(input.destinationCityCode);
  const distanceKm = origin && destination ? haversineKm(origin, destination) : 800;

  return {
    participantId: input.participantId,
    candidateCityCode: input.destinationCityCode,
    mode,
    source: "estimated",
    provider: "estimate",
    priceCny: estimatePrice(distanceKm, mode),
    departAt: null,
    arriveAt: null,
    durationMinutes: estimateDuration(distanceKm, mode),
    waitMinutes: null,
    isDirect: true,
    hasTransfer: false,
    transferCount: 0,
    bookingUrl: null,
    failureReason: "真实报价暂不可用，使用距离和交通方式粗估",
  };
}
```

- [x] **Step 5: Create scoring module**

Create `src/lib/recommendation/scoring.ts`:

```ts
import type { CityRecommendation, TravelOption } from "@/types/domain";

export type ScoreCandidateCityInput = {
  cityCode: string;
  cityName: string;
  options: TravelOption[];
};

function valueOrZero(value: number | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function scoreCandidateCity(input: ScoreCandidateCityInput): CityRecommendation {
  const usableOptions = input.options.filter((option) => option.source !== "unavailable");
  const prices = usableOptions.map((option) => valueOrZero(option.priceCny));
  const durations = usableOptions.map((option) => valueOrZero(option.durationMinutes));
  const totalPriceCny = prices.reduce((sum, value) => sum + value, 0);
  const totalDurationMinutes = durations.reduce((sum, value) => sum + value, 0);
  const avgPriceCny = usableOptions.length ? Math.round(totalPriceCny / usableOptions.length) : 0;
  const fairnessGap = prices.length ? Math.max(...prices) - Math.min(...prices) : 9999;
  const waitingPenalty = input.options.reduce((sum, option) => {
    const wait = option.waitMinutes ?? 0;
    if (wait <= 360) return sum;
    if (wait <= 720) return sum + Math.round((wait - 360) / 10);
    return sum + 9999;
  }, 0);
  const transferPenalty = input.options.reduce((sum, option) => sum + (option.hasTransfer ? 120 * Math.max(1, option.transferCount) : 0), 0);
  const estimatePenalty = input.options.reduce((sum, option) => sum + (option.source === "estimated" ? 200 : 0), 0);
  const missingPenalty = input.options.reduce((sum, option) => sum + (option.source === "unavailable" ? 9999 : 0), 0);

  return {
    cityCode: input.cityCode,
    cityName: input.cityName,
    totalPriceCny,
    avgPriceCny,
    totalDurationMinutes,
    fairnessGap,
    waitingPenalty,
    transferPenalty,
    estimatePenalty,
    missingPenalty,
    scoreCheapest: totalPriceCny + estimatePenalty + transferPenalty + missingPenalty,
    scoreBalanced: totalPriceCny + fairnessGap * 3 + waitingPenalty + transferPenalty + estimatePenalty + missingPenalty,
    scoreFastest: totalDurationMinutes + waitingPenalty * 2 + transferPenalty + estimatePenalty + missingPenalty,
    labels: [],
  };
}

export function pickPrimaryRecommendations(recommendations: CityRecommendation[]): CityRecommendation[] {
  const eligible = recommendations.filter((item) => item.missingPenalty === 0);
  const cheapest = [...eligible].sort((a, b) => a.scoreCheapest - b.scoreCheapest)[0];
  const balanced = [...eligible].sort((a, b) => a.scoreBalanced - b.scoreBalanced)[0];
  const fastest = [...eligible].sort((a, b) => a.scoreFastest - b.scoreFastest)[0];
  const labelMap = new Map<string, CityRecommendation>();

  for (const [label, item] of [
    ["cheapest", cheapest],
    ["balanced", balanced],
    ["fastest", fastest],
  ] as const) {
    if (!item) continue;
    const existing = labelMap.get(item.cityCode) ?? { ...item, labels: [] };
    existing.labels = Array.from(new Set([...existing.labels, label]));
    labelMap.set(item.cityCode, existing);
  }

  return Array.from(labelMap.values());
}
```

- [x] **Step 6: Run scoring test**

Run:

```bash
npm run test -- tests/scoring.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/lib/travel/types.ts src/lib/travel/estimate-provider.ts src/lib/recommendation/scoring.ts tests/scoring.test.ts
git commit -m "feat: add scoring and estimate provider"
```

---

### Task 8: FlyAI, Amap, And DeepSeek Provider Shells

**Files:**
- Create: `cross-city-meetpoint/src/lib/travel/flyai-provider.ts`
- Create: `cross-city-meetpoint/src/lib/city/city-provider.ts`
- Create: `cross-city-meetpoint/src/lib/ai/deepseek-client.ts`
- Create: `cross-city-meetpoint/src/lib/ai/recommendation-explainer.ts`

**Interfaces:**
- Produces: provider wrappers that can be called by calculation and explain APIs.

- [ ] **Step 1: Create FlyAI provider**

Create `src/lib/travel/flyai-provider.ts`:

```ts
import type { TravelOption } from "@/types/domain";
import { estimateTravelOption } from "./estimate-provider";
import type { TravelProvider, TravelSearchInput } from "./types";

export class FlyAITravelProvider implements TravelProvider {
  async search(input: TravelSearchInput): Promise<TravelOption[]> {
    const cliPath = process.env.FLYAI_CLI_PATH;
    if (!cliPath) {
      return input.acceptedModes.map((mode) => estimateTravelOption(input, mode));
    }

    return input.acceptedModes.map((mode) => estimateTravelOption(input, mode));
  }
}
```

Note: this MVP shell returns estimates until the exact FlyAI production access path is configured. The interface isolates API, MCP, CLI, or Skill-compatible access without changing callers.

- [ ] **Step 2: Extend city provider with Amap fallback**

Update `src/lib/city/city-provider.ts`:

```ts
import { searchLocalCities } from "@/data/cities";
import type { City } from "@/types/domain";

export async function searchCities(query: string): Promise<City[]> {
  const local = searchLocalCities(query);
  if (local.length > 0) return local;

  const amapKey = process.env.AMAP_API_KEY;
  if (!amapKey) return [];

  return [];
}
```

- [ ] **Step 3: Create DeepSeek client**

Create `src/lib/ai/deepseek-client.ts`:

```ts
import OpenAI from "openai";

export function createDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey,
  });
}
```

- [ ] **Step 4: Create recommendation explainer**

Create `src/lib/ai/recommendation-explainer.ts`:

```ts
import { z } from "zod";
import type { CityRecommendation } from "@/types/domain";
import { createDeepSeekClient } from "./deepseek-client";

const explanationSchema = z.object({
  short_reason: z.string(),
  risk_badges: z.array(z.string()),
  share_summary: z.string(),
  detail_explanation: z.string(),
});

export type RecommendationExplanation = z.infer<typeof explanationSchema>;

export function fallbackExplanation(recommendation: CityRecommendation): RecommendationExplanation {
  const badges = [];
  if (recommendation.estimatePenalty > 0) badges.push("含估算");
  if (recommendation.transferPenalty > 0) badges.push("含中转");
  if (recommendation.waitingPenalty > 0) badges.push("等待较久");

  return {
    short_reason: `${recommendation.cityName}在价格、耗时和公平度之间较均衡。`,
    risk_badges: badges,
    share_summary: `${recommendation.cityName}：人均约 ¥${recommendation.avgPriceCny}，总价约 ¥${recommendation.totalPriceCny}。`,
    detail_explanation: `该城市总去程约 ¥${recommendation.totalPriceCny}，人均约 ¥${recommendation.avgPriceCny}。请在购票前重新核对实时价格。`,
  };
}

export async function explainRecommendation(recommendation: CityRecommendation): Promise<RecommendationExplanation> {
  const client = createDeepSeekClient();
  if (!client) return fallbackExplanation(recommendation);

  const response = await client.chat.completions.create({
    model: "deepseek-v4-flash",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "你只根据输入的结构化推荐结果生成中文解释，不编造票价、车次或事实。输出 JSON。" },
      { role: "user", content: JSON.stringify(recommendation) },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return fallbackExplanation(recommendation);
  const parsed = explanationSchema.safeParse(JSON.parse(content));
  return parsed.success ? parsed.data : fallbackExplanation(recommendation);
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/travel/flyai-provider.ts src/lib/city/city-provider.ts src/lib/ai/deepseek-client.ts src/lib/ai/recommendation-explainer.ts
git commit -m "feat: add external provider shells"
```

---

### Task 9: Calculation Orchestration And API

**Files:**
- Create: `cross-city-meetpoint/src/lib/recommendation/calculate-run.ts`
- Create: `cross-city-meetpoint/src/app/api/plans/[code]/calculate/route.ts`

**Interfaces:**
- Consumes: candidate generator, FlyAI provider, scoring module, management token helper.
- Produces: `calculatePlanRecommendations({ code })` and `POST /api/plans/[code]/calculate`.

- [ ] **Step 1: Create calculation orchestrator**

Create `src/lib/recommendation/calculate-run.ts`:

```ts
import { generateCandidateCities } from "@/lib/city/candidate-generator";
import { scoreCandidateCity } from "@/lib/recommendation/scoring";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { FlyAITravelProvider } from "@/lib/travel/flyai-provider";
import type { TravelOption } from "@/types/domain";

export async function calculatePlanRecommendations({ code }: { code: string }) {
  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase.from("plans").select("*").eq("code", code).single();
  if (!plan) throw new Error("PLAN_NOT_FOUND");

  const { data: participants } = await supabase.from("participants").select("*").eq("plan_id", plan.id);
  const participantRows = participants ?? [];
  if (participantRows.length < 2) throw new Error("NOT_ENOUGH_PARTICIPANTS");

  const { data: manualCandidates } = await supabase.from("candidate_cities").select("*").eq("plan_id", plan.id);
  const manualAddCityCodes = (manualCandidates ?? []).filter((item) => item.source === "manual_add" && item.enabled).map((item) => item.city_code);
  const manualExcludeCityCodes = (manualCandidates ?? []).filter((item) => item.source === "manual_exclude").map((item) => item.city_code);
  const candidates = generateCandidateCities({
    departureCityCodes: participantRows.map((row) => row.departure_city_code),
    manualAddCityCodes,
    manualExcludeCityCodes,
    limit: 12,
  });

  const { data: run } = await supabase
    .from("recommendation_runs")
    .insert({ plan_id: plan.id, status: "running" })
    .select("id")
    .single();
  if (!run) throw new Error("RUN_CREATE_FAILED");

  const provider = new FlyAITravelProvider();
  const allOptions: TravelOption[] = [];

  for (const candidate of candidates) {
    for (const participant of participantRows) {
      const options = await provider.search({
        participantId: participant.id,
        originCityCode: participant.departure_city_code,
        originCityName: participant.departure_city_name,
        destinationCityCode: candidate.code,
        destinationCityName: candidate.name,
        meetingDate: plan.meeting_date,
        targetArrivalTime: plan.target_arrival_time,
        acceptedModes: participant.accepted_modes,
      });
      allOptions.push(...options);
    }
  }

  if (allOptions.length > 0) {
    await supabase.from("travel_options").insert(allOptions.map((option) => ({
      run_id: run.id,
      participant_id: option.participantId,
      candidate_city_code: option.candidateCityCode,
      mode: option.mode,
      source: option.source,
      provider: option.provider,
      price_cny: option.priceCny,
      depart_at: option.departAt,
      arrive_at: option.arriveAt,
      duration_minutes: option.durationMinutes,
      wait_minutes: option.waitMinutes,
      is_direct: option.isDirect,
      has_transfer: option.hasTransfer,
      transfer_count: option.transferCount,
      booking_url: option.bookingUrl,
      failure_reason: option.failureReason,
    })));
  }

  const recommendations = candidates.map((candidate) => {
    return scoreCandidateCity({
      cityCode: candidate.code,
      cityName: candidate.name,
      options: allOptions.filter((option) => option.candidateCityCode === candidate.code),
    });
  });

  await supabase.from("city_recommendations").insert(recommendations.map((item) => ({
    run_id: run.id,
    city_code: item.cityCode,
    city_name: item.cityName,
    total_price_cny: item.totalPriceCny,
    avg_price_cny: item.avgPriceCny,
    total_duration_minutes: item.totalDurationMinutes,
    fairness_gap: item.fairnessGap,
    waiting_penalty: item.waitingPenalty,
    transfer_penalty: item.transferPenalty,
    estimate_penalty: item.estimatePenalty,
    missing_penalty: item.missingPenalty,
    score_cheapest: item.scoreCheapest,
    score_balanced: item.scoreBalanced,
    score_fastest: item.scoreFastest,
    labels: item.labels,
  })));

  await supabase.from("recommendation_runs").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    stale_after: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }).eq("id", run.id);

  await supabase.from("plans").update({
    status: "completed",
    last_calculated_at: new Date().toISOString(),
  }).eq("id", plan.id);

  return { runId: run.id, candidateCount: candidates.length };
}
```

- [ ] **Step 2: Create calculation API**

Create `src/app/api/plans/[code]/calculate/route.ts`:

```ts
import { NextResponse } from "next/server";
import { calculatePlanRecommendations } from "@/lib/recommendation/calculate-run";
import { verifyManagementTokenForPlan } from "@/lib/security/management-token";

export async function POST(req: Request, { params }: { params: { code: string } }) {
  const verified = await verifyManagementTokenForPlan(params.code, req.headers.get("x-management-token"));
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status });

  try {
    const result = await calculatePlanRecommendations({ code: params.code });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CALCULATION_FAILED" },
      { status: 400 },
    );
  }
}
```

- [ ] **Step 3: Verify**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/recommendation/calculate-run.ts src/app/api/plans/[code]/calculate/route.ts
git commit -m "feat: add recommendation calculation API"
```

---

### Task 10: Public Plan, Management, And Result Pages

**Files:**
- Create: `cross-city-meetpoint/src/app/api/plans/[code]/route.ts`
- Create: `cross-city-meetpoint/src/components/plan/ParticipantList.tsx`
- Create: `cross-city-meetpoint/src/components/result/RecommendationCard.tsx`
- Create: `cross-city-meetpoint/src/components/ui/Notice.tsx`
- Create: `cross-city-meetpoint/src/app/p/[code]/page.tsx`
- Create: `cross-city-meetpoint/src/app/p/[code]/manage/page.tsx`
- Create: `cross-city-meetpoint/src/app/p/[code]/result/page.tsx`

**Interfaces:**
- Consumes: Supabase data and calculation API.
- Produces: usable H5 read, manage, and result screens.

- [ ] **Step 1: Create plan read API**

Create `src/app/api/plans/[code]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase.from("plans").select("*").eq("code", params.code).single();
  if (!plan) return NextResponse.json({ error: "PLAN_NOT_FOUND" }, { status: 404 });
  const { data: participants } = await supabase.from("participants").select("*").eq("plan_id", plan.id);
  const { data: runs } = await supabase.from("recommendation_runs").select("*").eq("plan_id", plan.id).order("started_at", { ascending: false }).limit(1);
  return NextResponse.json({ plan, participants: participants ?? [], latestRun: runs?.[0] ?? null });
}
```

- [ ] **Step 2: Create simple Notice component**

Create `src/components/ui/Notice.tsx`:

```tsx
export function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">{children}</div>;
}
```

- [ ] **Step 3: Create ParticipantList**

Create `src/components/plan/ParticipantList.tsx`:

```tsx
type Participant = {
  id: string;
  name: string;
  departure_city_name: string;
  accepted_modes: string[];
};

export function ParticipantList({ participants }: { participants: Participant[] }) {
  return (
    <div className="space-y-2">
      {participants.map((participant) => (
        <div className="rounded-lg border p-3" key={participant.id}>
          <div className="font-medium">{participant.name}</div>
          <div className="mt-1 text-sm text-gray-500">{participant.departure_city_name} · {participant.accepted_modes.join(" / ")}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create public plan page**

Create `src/app/p/[code]/page.tsx`:

```tsx
import Link from "next/link";
import { ParticipantList } from "@/components/plan/ParticipantList";
import { Notice } from "@/components/ui/Notice";

async function getPlan(code: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/plans/${code}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function PublicPlanPage({ params }: { params: { code: string } }) {
  const data = await getPlan(params.code);
  if (!data) return <main className="p-5">计划不存在</main>;

  return (
    <main className="mx-auto min-h-screen max-w-md bg-white px-5 py-6">
      <h1 className="text-2xl font-semibold">{data.plan.title}</h1>
      <p className="mt-2 text-sm text-gray-500">{data.plan.meeting_date} 到达 {data.plan.target_arrival_time}</p>
      <div className="mt-6 flex gap-2">
        <Link className="flex-1 rounded-lg bg-black py-3 text-center text-white" href={`/p/${params.code}/join`}>填写我的信息</Link>
        <Link className="flex-1 rounded-lg border py-3 text-center" href={`/p/${params.code}/result`}>看结果</Link>
      </div>
      <section className="mt-6">
        <h2 className="mb-3 font-medium">已填写的人</h2>
        {data.participants.length ? <ParticipantList participants={data.participants} /> : <Notice>还没有人填写。</Notice>}
      </section>
      {!data.latestRun && <div className="mt-4"><Notice>发起人还没有开始计算。</Notice></div>}
    </main>
  );
}
```

- [ ] **Step 5: Create RecommendationCard**

Create `src/components/result/RecommendationCard.tsx`:

```tsx
type Recommendation = {
  id: string;
  city_name: string;
  total_price_cny: number;
  avg_price_cny: number;
  labels: string[];
  explanation: string | null;
  risk_summary: string | null;
  estimate_penalty: number;
  transfer_penalty: number;
  waiting_penalty: number;
};

export function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const badges = [
    recommendation.estimate_penalty > 0 ? "含估算" : null,
    recommendation.transfer_penalty > 0 ? "含中转" : null,
    recommendation.waiting_penalty > 0 ? "等待较久" : null,
  ].filter(Boolean);

  return (
    <article className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">{recommendation.city_name}</h3>
          <p className="mt-1 text-sm text-gray-500">{recommendation.labels.join(" / ")}</p>
        </div>
        <div className="text-right">
          <div className="font-semibold">¥{recommendation.total_price_cny}</div>
          <div className="text-xs text-gray-500">人均 ¥{recommendation.avg_price_cny}</div>
        </div>
      </div>
      {badges.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{badges.map((badge) => <span className="rounded-full bg-gray-100 px-2 py-1 text-xs" key={badge}>{badge}</span>)}</div>}
      <p className="mt-3 text-sm leading-6 text-gray-700">{recommendation.explanation ?? "请在购票前重新核对实时价格。"}</p>
    </article>
  );
}
```

- [ ] **Step 6: Create result page**

Create `src/app/p/[code]/result/page.tsx`:

```tsx
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { RecommendationCard } from "@/components/result/RecommendationCard";
import { Notice } from "@/components/ui/Notice";

export default async function ResultPage({ params }: { params: { code: string } }) {
  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase.from("plans").select("id,title").eq("code", params.code).single();
  if (!plan) return <main className="p-5">计划不存在</main>;
  const { data: run } = await supabase.from("recommendation_runs").select("*").eq("plan_id", plan.id).order("started_at", { ascending: false }).limit(1).single();
  const { data: recommendations } = run
    ? await supabase.from("city_recommendations").select("*").eq("run_id", run.id).order("score_balanced", { ascending: true })
    : { data: [] };

  return (
    <main className="mx-auto min-h-screen max-w-md bg-white px-5 py-6">
      <h1 className="text-2xl font-semibold">{plan.title}</h1>
      {!run && <div className="mt-4"><Notice>还没有计算结果。</Notice></div>}
      {run?.stale_after && new Date(run.stale_after).getTime() < Date.now() && <div className="mt-4"><Notice>票价可能已变化，建议重新计算。</Notice></div>}
      <div className="mt-6 space-y-4">
        {(recommendations ?? []).slice(0, 3).map((recommendation) => (
          <RecommendationCard recommendation={recommendation} key={recommendation.id} />
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Create basic manage page**

Create `src/app/p/[code]/manage/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { CandidateCityEditor } from "@/components/plan/CandidateCityEditor";

export default function ManagePage({ params }: { params: { code: string } }) {
  const [managementToken, setManagementToken] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function calculate() {
    setLoading(true);
    setMessage("");
    const res = await fetch(`/api/plans/${params.code}/calculate`, {
      method: "POST",
      headers: { "x-management-token": managementToken },
    });
    const json = await res.json();
    setLoading(false);
    setMessage(res.ok ? `计算完成：${json.candidateCount} 个候选城市` : json.error);
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-white px-5 py-6">
      <h1 className="text-2xl font-semibold">管理计划</h1>
      <p className="mt-2 text-sm text-gray-500">输入管理口令后，可以调整候选城市并手动计算。</p>
      <input
        className="mt-6 w-full rounded-lg border px-4 py-3"
        placeholder="管理口令"
        value={managementToken}
        onChange={(event) => setManagementToken(event.target.value)}
      />
      {managementToken && <div className="mt-4"><CandidateCityEditor code={params.code} managementToken={managementToken} /></div>}
      <button className="mt-6 w-full rounded-lg bg-black py-3 text-white disabled:opacity-60" disabled={loading || !managementToken} onClick={calculate}>
        {loading ? "计算中" : "开始计算"}
      </button>
      {message && <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm">{message}</p>}
    </main>
  );
}
```

- [ ] **Step 8: Verify**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/plans/[code]/route.ts src/components/plan/ParticipantList.tsx src/components/result/RecommendationCard.tsx src/components/ui/Notice.tsx src/app/p/[code]/page.tsx src/app/p/[code]/manage/page.tsx src/app/p/[code]/result/page.tsx
git commit -m "feat: add public plan management and result pages"
```

---

### Task 11: Explanation API And Result Explanations

**Files:**
- Create: `cross-city-meetpoint/src/app/api/plans/[code]/explain/route.ts`
- Modify: `cross-city-meetpoint/src/lib/recommendation/calculate-run.ts`

**Interfaces:**
- Consumes: `explainRecommendation`.
- Produces: explanation fields on `city_recommendations`.

- [ ] **Step 1: Create explain API**

Create `src/app/api/plans/[code]/explain/route.ts`:

```ts
import { NextResponse } from "next/server";
import { explainRecommendation } from "@/lib/ai/recommendation-explainer";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export async function POST(_req: Request, { params }: { params: { code: string } }) {
  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase.from("plans").select("id").eq("code", params.code).single();
  if (!plan) return NextResponse.json({ error: "PLAN_NOT_FOUND" }, { status: 404 });
  const { data: run } = await supabase.from("recommendation_runs").select("id").eq("plan_id", plan.id).order("started_at", { ascending: false }).limit(1).single();
  if (!run) return NextResponse.json({ error: "RUN_NOT_FOUND" }, { status: 404 });
  const { data: rows } = await supabase.from("city_recommendations").select("*").eq("run_id", run.id);

  for (const row of rows ?? []) {
    const explanation = await explainRecommendation({
      cityCode: row.city_code,
      cityName: row.city_name,
      totalPriceCny: row.total_price_cny,
      avgPriceCny: row.avg_price_cny,
      totalDurationMinutes: row.total_duration_minutes,
      fairnessGap: row.fairness_gap,
      waitingPenalty: row.waiting_penalty,
      transferPenalty: row.transfer_penalty,
      estimatePenalty: row.estimate_penalty,
      missingPenalty: row.missing_penalty,
      scoreCheapest: row.score_cheapest,
      scoreBalanced: row.score_balanced,
      scoreFastest: row.score_fastest,
      labels: row.labels,
    });
    await supabase.from("city_recommendations").update({
      explanation: explanation.short_reason,
      risk_summary: explanation.risk_badges.join("、"),
    }).eq("id", row.id);
  }

  return NextResponse.json({ ok: true, count: rows?.length ?? 0 });
}
```

- [ ] **Step 2: Verify**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/plans/[code]/explain/route.ts
git commit -m "feat: add deepseek explanation API"
```

---

### Task 12: Final Verification And Handoff

**Files:**
- Modify: `cross-city-meetpoint/README.md`

**Interfaces:**
- Produces: verified MVP baseline and setup documentation.

- [ ] **Step 1: Update README setup**

Append to `README.md`:

```md
## MVP Verification

Run before handoff:

```bash
npm run lint
npm run test
npm run build
```

Manual H5 acceptance:

1. Create a plan.
2. Open the public link.
3. Submit two participants from different cities.
4. Start calculation from the manage page.
5. Open result page and verify recommendation cards render.
6. Confirm estimates are visually marked and stale results show a warning after `stale_after`.
```
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run lint
npm run test
npm run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add mvp verification steps"
```

---

## Self-Review Notes

- Spec coverage: project setup, Supabase, city generation, travel provider isolation, estimate fallback, scoring, DeepSeek explanations, H5 pages, security, and verification are covered.
- Known deferred implementation detail: actual FlyAI production command/API/MCP wiring is isolated behind `FlyAITravelProvider`; the MVP shell returns estimates until credentials and production access are available.
- Candidate add/exclude and management-token-gated calculation are included in Task 6.5 and Task 10.
- No task asks DeepSeek to rank cities or generate ticket prices.
