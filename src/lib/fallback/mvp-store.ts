import { randomUUID } from "node:crypto";

import {
  POLICY_VERSION,
  calculationOutputSchema,
  verifiedQuoteSchema,
  type RecommendationProposal,
  type RunStatus,
  type VerifiedQuote,
} from "@/lib/agent/contracts";
import { generateCandidateCities } from "@/lib/city/candidate-generator";
import { findCityByCode } from "@/data/cities";
import { buildRouteTasks } from "@/lib/recommendation/query-matrix";
import { rankEligibleCities } from "@/lib/recommendation/policy";
import type { StoredRouteTask } from "@/lib/recommendation/repository";
import { validateRecommendationPolicy } from "@/lib/recommendation/validators";
import { generateToken, hashToken, verifyToken } from "@/lib/security/tokens";
import type { TransportMode } from "@/types/domain";

type PlanRow = {
  id: string;
  code: string;
  title: string;
  meetingDate: string;
  participantLimit: number;
  status: "collecting" | "completed";
};

type ParticipantRow = {
  id: string;
  planId: string;
  name: string;
  departureCityCode: string;
  departureCityName: string;
  acceptedModes: TransportMode[];
};

type RunRow = {
  id: string;
  planId: string;
  status: RunStatus;
  traceId: string;
  retryAfter: string | null;
  errorCode: string | null;
  policyVersion: string;
  kind: "automatic" | "alternative";
  requestedCityCode: string | null;
  requestedByParticipantId: string | null;
  startedAt: string;
  completedAt: string | null;
};

type ProposalRow = {
  id: string;
  runId: string;
  version: number;
  status: "approved" | "rejected";
  output: unknown;
  validation: { ok: true } | { ok: false; codes: string[] };
};

type ResultRow = {
  id: string;
  planId: string;
  runId: string;
  proposalId: string;
  cityCode: string;
  explanationZh: string;
  isShared: boolean;
  publishedAt: string | null;
  supersededAt: string | null;
};

type SchemeRow = {
  id: string;
  resultId: string;
  kind: "saving" | "fast";
  totalFareCny: number;
  totalDurationMinutes: number;
  latestArrivalAt: string;
  teamTransferCount: number;
};

type SchemeRouteRow = { schemeId: string; participantId: string; verifiedQuoteId: string };

type StoreState = {
  version: 2;
  plans: PlanRow[];
  planCredentials: Array<{ planId: string; hostTokenHash: string }>;
  participants: ParticipantRow[];
  participantCredentials: Array<{ participantId: string; editTokenHash: string }>;
  runs: RunRow[];
  tasks: StoredRouteTask[];
  quotes: Array<VerifiedQuote & { runId: string }>;
  proposals: ProposalRow[];
  results: ResultRow[];
  schemes: SchemeRow[];
  schemeRoutes: SchemeRouteRow[];
  events: Array<{ runId: string; traceId: string; event: string }>;
};

const globalKey = "__crossCityMeetpointFallbackStore";
const globalStore = globalThis as typeof globalThis & { [globalKey]?: StoreState };
const activeStatuses = new Set<RunStatus>([
  "pending", "collecting", "cooling_down", "calculating", "validating", "awaiting_host_confirmation",
]);

function state(): StoreState {
  const existing = globalStore[globalKey];
  if (existing?.version === 2) return existing;
  const next: StoreState = {
    version: 2, plans: [], planCredentials: [], participants: [], participantCredentials: [],
    runs: [], tasks: [], quotes: [], proposals: [], results: [], schemes: [], schemeRoutes: [], events: [],
  };
  globalStore[globalKey] = next;
  return next;
}

function timestamp() { return new Date().toISOString(); }
function id(prefix: string) { return `${prefix}_${randomUUID()}`; }
function latestRun(planId: string) {
  return state().runs.filter((run) => run.planId === planId)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0] ?? null;
}
function participantsFor(planId: string) { return state().participants.filter((participant) => participant.planId === planId); }
function planFor(code: string) { return state().plans.find((plan) => plan.code === code) ?? null; }
function runFor(runId: string) { return state().runs.find((run) => run.id === runId) ?? null; }

function publicPlan(plan: PlanRow) {
  return { code: plan.code, title: plan.title, meeting_date: plan.meetingDate, participant_limit: plan.participantLimit, status: plan.status };
}

function publicProgress(run: RunRow | null) {
  if (!run) return null;
  return {
    status: run.status,
    traceId: run.traceId,
    pendingGroups: state().tasks.filter((task) => task.runId === run.id && ["pending", "running", "retryable_failure"].includes(task.status)).length,
    retryAt: run.retryAfter,
    diagnosticCode: run.errorCode,
  };
}

export function resetFallbackStoreForTests() {
  globalStore[globalKey] = undefined;
}

export async function createFallbackPlan(input: { title: string; arrivalDate: string; participantLimit: number }) {
  const store = state();
  let code = Math.random().toString(36).slice(2, 8).toUpperCase();
  while (store.plans.some((plan) => plan.code === code)) code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const hostToken = generateToken();
  const plan: PlanRow = { id: id("plan"), code, title: input.title, meetingDate: input.arrivalDate, participantLimit: input.participantLimit, status: "collecting" };
  store.plans.push(plan);
  store.planCredentials.push({ planId: plan.id, hostTokenHash: await hashToken(hostToken) });
  return { code, shareUrl: `/p/${code}`, hostToken };
}

export async function createFallbackParticipant(code: string, input: {
  name: string; departureCityCode: string; departureCityName: string; acceptedModes: TransportMode[];
}) {
  const plan = planFor(code);
  if (!plan) return { ok: false as const, status: 404, error: "PLAN_NOT_FOUND" };
  if (participantsFor(plan.id).length >= plan.participantLimit) return { ok: false as const, status: 409, error: "PARTICIPANT_LIMIT_REACHED" };
  const editToken = generateToken();
  const participant: ParticipantRow = { id: id("participant"), planId: plan.id, ...input };
  state().participants.push(participant);
  state().participantCredentials.push({ participantId: participant.id, editTokenHash: await hashToken(editToken) });
  return { ok: true as const, participantId: participant.id, editToken };
}

export async function verifyFallbackParticipantCanCalculate(code: string, token: string) {
  const plan = planFor(code);
  if (!plan) return { ok: false as const, status: 404, error: "PLAN_NOT_FOUND" };
  if (participantsFor(plan.id).length < plan.participantLimit) return { ok: false as const, status: 409, error: "PARTICIPANT_LIMIT_NOT_REACHED" };
  for (const participant of participantsFor(plan.id)) {
    const credential = state().participantCredentials.find((entry) => entry.participantId === participant.id);
    if (credential && await verifyToken(token, credential.editTokenHash)) return { ok: true as const, planId: plan.id, participantId: participant.id };
  }
  return { ok: false as const, status: 403, error: "INVALID_PARTICIPANT_TOKEN" };
}

function createMatrix(plan: PlanRow, kind: RunRow["kind"], requestedCityCode: string | null, requestedByParticipantId: string | null) {
  const participants = participantsFor(plan.id);
  const candidates = requestedCityCode
    ? [findCityByCode(requestedCityCode)].filter((city): city is NonNullable<typeof city> => Boolean(city))
    : generateCandidateCities({ departureCityCodes: participants.map((participant) => participant.departureCityCode) });
  if (candidates.length === 0) throw new Error("RUN_CREATE_FAILED");
  const run: RunRow = {
    id: id("run"), planId: plan.id, status: "pending", traceId: randomUUID(), retryAfter: null,
    errorCode: null, policyVersion: POLICY_VERSION, kind, requestedCityCode, requestedByParticipantId,
    startedAt: timestamp(), completedAt: null,
  };
  state().runs.push(run);
  for (const draft of buildRouteTasks({
    participants: participants.map((participant) => ({ id: participant.id, departureCityCode: participant.departureCityCode, departureCityName: participant.departureCityName, acceptedModes: participant.acceptedModes })),
    candidates, arrivalDate: plan.meetingDate,
  })) {
    state().tasks.push({ id: id("task"), runId: run.id, participantId: draft.participantId, cityCode: draft.cityCode, originCityCode: draft.originCityCode, mode: draft.mode, searchDate: draft.searchDate, arrivalDate: draft.arrivalDate, physicalKey: draft.physicalKey, status: "pending", attemptCount: 0, retryAfter: null, errorCode: null });
  }
  return run;
}

export async function calculateFallbackRecommendations(code: string) {
  const plan = planFor(code);
  if (!plan) throw new Error("PLAN_NOT_FOUND");
  if (participantsFor(plan.id).length < 2) throw new Error("NOT_ENOUGH_PARTICIPANTS");
  if (state().runs.some((run) => run.planId === plan.id && activeStatuses.has(run.status))) throw new Error("CALCULATION_IN_PROGRESS");
  const run = createMatrix(plan, "automatic", null, null);
  return { runId: run.id, status: "pending" as const };
}

export async function createFallbackAlternativePreview(input: { code: string; participantToken: string; cityCode: string }) {
  const verified = await verifyFallbackParticipantCanCalculate(input.code, input.participantToken);
  if (!verified.ok) throw new Error(verified.error);
  const plan = planFor(input.code)!;
  if (!findCityByCode(input.cityCode)) throw new Error("UNSUPPORTED_CITY");
  const run = createMatrix(plan, "alternative", input.cityCode, verified.participantId);
  return { runId: run.id, status: "pending" as const };
}

export function seedFallbackVerifiedQuotes(runId: string, quotes: readonly VerifiedQuote[]) {
  const run = runFor(runId);
  if (!run) throw new Error("RUN_NOT_FOUND");
  for (const source of quotes) {
    const quote = verifiedQuoteSchema.parse(source);
    const task = state().tasks.find((entry) => entry.runId === runId && entry.participantId === quote.participantId && entry.cityCode === quote.cityCode && entry.mode === quote.mode && entry.searchDate === quote.searchDate);
    if (!task) throw new Error("QUOTE_TASK_MISMATCH");
    if (!state().quotes.some((entry) => entry.runId === runId && entry.participantId === quote.participantId && entry.quoteId === quote.quoteId)) state().quotes.push({ ...quote, runId });
    task.status = "succeeded";
    task.attemptCount += 1;
  }
}

function cityInputs(run: RunRow) {
  const participantIds = participantsFor(run.planId).map((participant) => participant.id).sort();
  const quotes = state().quotes.filter((quote) => quote.runId === run.id);
  return [...new Set(quotes.map((quote) => quote.cityCode))].sort().map((cityCode) => ({ cityCode, quotes: quotes.filter((quote) => quote.cityCode === cityCode), participantIds, arrivalDate: planById(run.planId)!.meetingDate }));
}
function planById(planId: string) { return state().plans.find((plan) => plan.id === planId) ?? null; }

function deterministicProposal(run: RunRow): RecommendationProposal | null {
  const ranked = rankEligibleCities(cityInputs(run));
  const selected = ranked[0];
  if (!selected) return null;
  return {
    status: "proposal", cityCode: selected.cityCode,
    schemes: [selected.savingScheme, selected.fastScheme],
    comparisonEvidence: { eligibleCityCodes: ranked.map((item) => item.cityCode).sort(), orderedCityCodes: ranked.map((item) => item.cityCode) },
    explanationZh: "已按已验证票价生成方案。",
  };
}

function saveProposal(run: RunRow, output: unknown) {
  const parsed = calculationOutputSchema.safeParse(output);
  const proposal = parsed.success && parsed.data.status === "proposal" ? parsed.data : null;
  const input = { participantIds: participantsFor(run.planId).map((participant) => participant.id), arrivalDate: planById(run.planId)!.meetingDate, cityInputs: cityInputs(run).map(({ cityCode, quotes }) => ({ cityCode, quotes })), proposal: output };
  const validation = proposal ? validateRecommendationPolicy(input) : { ok: false as const, codes: ["INVALID_PROPOSAL"] };
  const row: ProposalRow = {
    id: id("proposal"), runId: run.id, version: 1,
    status: proposal && validation.ok ? "approved" : "rejected", output, validation,
  };
  state().proposals.push(row);
  if (!proposal || !validation.ok) {
    run.status = "failed";
    run.errorCode = "AGENT_PROPOSAL_INVALID";
    run.completedAt = timestamp();
    return null;
  }
  return row;
}

function materializeResult(run: RunRow, proposal: ProposalRow) {
  const parsed = calculationOutputSchema.safeParse(proposal.output);
  if (!parsed.success || parsed.data.status !== "proposal" || proposal.status !== "approved" || !proposal.validation.ok) {
    throw new Error("PUBLICATION_GUARD_REJECTED");
  }
  const output = parsed.data;
  const existing = state().results.find((result) => result.runId === run.id && result.proposalId === proposal.id);
  if (existing) return existing;
  const quoteById = new Map(state().quotes.filter((quote) => quote.runId === run.id).map((quote) => [quote.quoteId, quote]));
  const result: ResultRow = { id: id("result"), planId: run.planId, runId: run.id, proposalId: proposal.id, cityCode: output.cityCode, explanationZh: output.explanationZh, isShared: false, publishedAt: null, supersededAt: null };
  const staged: Array<{ scheme: SchemeRow; routes: SchemeRouteRow[] }> = [];
  for (const scheme of output.schemes) {
    const selected = participantsFor(run.planId).map((participant) => quoteById.get(scheme.quoteIdsByParticipant[participant.id] ?? ""));
    if (selected.some((quote) => !quote || quote.cityCode !== result.cityCode)) throw new Error("PUBLICATION_GUARD_REJECTED");
    const verified = selected as VerifiedQuote[];
    const schemeRow: SchemeRow = { id: id("scheme"), resultId: result.id, kind: scheme.kind, totalFareCny: scheme.totalFareCny, totalDurationMinutes: verified.reduce((sum, quote) => sum + quote.durationMinutes, 0), latestArrivalAt: verified.map((quote) => quote.arriveAt).sort().at(-1)!, teamTransferCount: verified.reduce((sum, quote) => sum + quote.transferCount, 0) };
    staged.push({ scheme: schemeRow, routes: verified.map((quote) => ({ schemeId: schemeRow.id, participantId: quote.participantId, verifiedQuoteId: quote.id })) });
  }
  state().results.push(result);
  state().schemes.push(...staged.map((entry) => entry.scheme));
  state().schemeRoutes.push(...staged.flatMap((entry) => entry.routes));
  return result;
}

function publishAutomatic(run: RunRow, proposal: ProposalRow) {
  if (state().results.some((result) => result.planId === run.planId && result.isShared && !result.supersededAt)) throw new Error("PUBLICATION_GUARD_REJECTED");
  const result = materializeResult(run, proposal);
  result.isShared = true;
  result.publishedAt = timestamp();
  run.status = "completed";
  run.completedAt = timestamp();
  planById(run.planId)!.status = "completed";
}

export function submitFallbackProposal(runId: string, output: unknown) {
  const run = runFor(runId);
  if (!run) throw new Error("RUN_NOT_FOUND");
  if (run.status !== "calculating") throw new Error("INVALID_RUN_STATUS");
  return saveProposal(run, output);
}

export async function advanceFallbackRun(input: { runId: string; planId: string }) {
  const run = runFor(input.runId);
  if (!run || run.planId !== input.planId) throw new Error("RUN_NOT_FOUND");
  if (["completed", "incomplete", "failed", "awaiting_host_confirmation"].includes(run.status)) return publicProgress(run)!;
  if (run.status === "pending") run.status = "collecting";
  else if (run.status === "collecting") {
    if (rankEligibleCities(cityInputs(run)).length === 0) {
      run.status = "incomplete";
      run.errorCode = "REAL_QUOTE_COVERAGE_INCOMPLETE";
      run.completedAt = timestamp();
    } else run.status = "calculating";
  } else if (run.status === "calculating") {
    const proposal = saveProposal(run, deterministicProposal(run));
    if (proposal) run.status = "validating";
  } else if (run.status === "validating") {
    const proposal = state().proposals.find((entry) => entry.runId === run.id && entry.status === "approved");
    if (!proposal) { run.status = "failed"; run.errorCode = "AGENT_PROPOSAL_INVALID"; }
    else if (run.kind === "alternative") { materializeResult(run, proposal); run.status = "awaiting_host_confirmation"; }
    else {
      try { publishAutomatic(run, proposal); } catch { run.status = "failed"; run.errorCode = "PUBLICATION_GUARD_REJECTED"; run.completedAt = timestamp(); }
    }
  }
  return publicProgress(run)!;
}

export async function readFallbackPrivatePreview(input: { runId: string; participantToken: string }) {
  const run = runFor(input.runId);
  if (!run || run.kind !== "alternative" || !run.requestedByParticipantId) return null;
  const credential = state().participantCredentials.find((entry) => entry.participantId === run.requestedByParticipantId);
  if (!credential || !await verifyToken(input.participantToken, credential.editTokenHash)) return null;
  return state().results.find((result) => result.runId === run.id) ?? null;
}

export async function confirmFallbackAlternative(input: { runId: string; hostToken: string }) {
  const run = runFor(input.runId);
  if (!run || run.kind !== "alternative" || run.status !== "awaiting_host_confirmation") throw new Error("RUN_NOT_FOUND");
  const credential = state().planCredentials.find((entry) => entry.planId === run.planId);
  if (!credential || !await verifyToken(input.hostToken, credential.hostTokenHash)) throw new Error("INVALID_HOST_TOKEN");
  const result = state().results.find((entry) => entry.runId === run.id);
  if (!result) throw new Error("PUBLICATION_GUARD_REJECTED");
  const current = state().results.find((entry) => entry.planId === run.planId && entry.isShared && !entry.supersededAt);
  if (current) current.supersededAt = timestamp();
  result.isShared = true;
  result.publishedAt = timestamp();
  run.status = "completed";
  run.completedAt = timestamp();
  return result;
}

export function readFallbackPlan(code: string) {
  const plan = planFor(code);
  if (!plan) return null;
  const run = latestRun(plan.id);
  const shared = run?.status === "completed" ? state().results.find((result) => result.runId === run.id && result.isShared) ?? null : null;
  return {
    plan: publicPlan(plan),
    participants: participantsFor(plan.id).map((participant) => ({ id: participant.id, name: participant.name, departure_city_name: participant.departureCityName, accepted_modes: participant.acceptedModes })),
    latestRun: publicProgress(run),
    latestSharedResult: shared,
  };
}

export function readFallbackResult(code: string) {
  const data = readFallbackPlan(code);
  if (!data) return null;
  return { ...data, recommendations: [], latestRun: data.latestRun ? { status: data.latestRun.status, stale_after: null } : null };
}

export function readFallbackCandidates(code: string) { return planFor(code) ? [] : null; }
export function saveFallbackCandidate() { /* Candidate editing remains disabled by the public route. */ }
export async function explainFallbackLatestRun(code: string) {
  return planFor(code) ? { ok: true as const, count: 0 } : { ok: false as const, status: 404, error: "PLAN_NOT_FOUND" };
}
