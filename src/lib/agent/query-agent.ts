import { z } from "zod";

import { findCityByCode } from "@/data/cities";
import { queryOutcomeSchema, routeTaskSchema, type QueryOutcome } from "@/lib/agent/contracts";
import {
  deterministicVerifiedQuoteId,
  type RecommendationRepository,
  type StoredRouteTask,
} from "@/lib/recommendation/repository";
import { validateArrivalDate } from "@/lib/recommendation/date";
import {
  GatewayClientError,
  searchGateway,
  type GatewaySearchResult,
} from "@/lib/travel/gateway-client";
import type { GatewaySearchRequest } from "@/lib/travel/types";

export type TicketTool = (input: GatewaySearchRequest) => Promise<GatewaySearchResult>;

export type PhysicalTicketScheduler = {
  run<T>(physicalKey: string, operation: () => Promise<T>): Promise<T>;
};

export function createPhysicalTicketScheduler(): PhysicalTicketScheduler {
  const inFlight = new Map<string, Promise<unknown>>();
  let serialTail: Promise<void> = Promise.resolve();
  return {
    run<T>(physicalKey: string, operation: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(physicalKey);
      if (existing) return existing as Promise<T>;
      const promise = serialTail.then(operation, operation);
      serialTail = promise.then(() => undefined, () => undefined);
      inFlight.set(physicalKey, promise);
      void promise.finally(() => {
        if (inFlight.get(physicalKey) === promise) inFlight.delete(physicalKey);
      }).catch(() => undefined);
      return promise;
    },
  };
}

const defaultPhysicalScheduler = createPhysicalTicketScheduler();

const retryableCodes = new Set([
  "GATEWAY_TIMEOUT",
  "GATEWAY_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_UPSTREAM_UNAVAILABLE",
]);

const emptyCodes = new Set(["PROVIDER_NO_ROUTE", "PROVIDER_NO_TICKET"]);

const storedRouteTaskSchema = routeTaskSchema.extend({ arrivalDate: z.iso.date() }).strict();

function validatedTask(value: unknown, taskId: string): StoredRouteTask {
  const task = storedRouteTaskSchema.parse(value);
  if (task.id !== taskId) throw new Error(`Route task id mismatch: ${taskId}`);
  const canonicalPhysicalKey = [
    task.originCityCode,
    task.cityCode,
    task.mode,
    task.searchDate,
  ].join(":");
  if (task.physicalKey !== canonicalPhysicalKey) {
    throw new Error(`Route task physicalKey mismatch: ${taskId}`);
  }
  return task;
}

function gatewayRequest(task: StoredRouteTask): GatewaySearchRequest | null {
  const origin = findCityByCode(task.originCityCode);
  const destination = findCityByCode(task.cityCode);
  if (!origin || !destination) return null;
  return {
    originCityCode: origin.code,
    originCityName: origin.name,
    destinationCityCode: destination.code,
    destinationCityName: destination.name,
    departureDate: task.searchDate,
    mode: task.mode,
  };
}

function errorOutcome(error: unknown): QueryOutcome {
  if (!(error instanceof GatewayClientError)) {
    return { status: "terminal_failure", code: "UNEXPECTED_TICKET_TOOL_ERROR" };
  }
  if (emptyCodes.has(error.code)) return { status: "empty" };
  if (retryableCodes.has(error.code)) {
    return {
      status: "retryable_failure",
      code: error.code,
      retryAfterMs: Math.max(0, error.retryAfterMs ?? 0),
    };
  }
  return { status: "terminal_failure", code: error.code };
}

export class QueryAgent {
  constructor(
    private readonly repository: RecommendationRepository,
    private readonly ticketTool: TicketTool = searchGateway,
    private readonly scheduler: PhysicalTicketScheduler = defaultPhysicalScheduler,
  ) {}

  async execute(taskId: string): Promise<QueryOutcome> {
    const stored = await this.repository.getRouteTask(taskId);
    if (!stored) throw new Error(`Route task not found: ${taskId}`);
    validatedTask(stored, taskId);
    const task = validatedTask(await this.repository.markTaskRunning(taskId), taskId);
    const request = gatewayRequest(task);
    let outcome: QueryOutcome;
    if (!request) {
      outcome = { status: "terminal_failure", code: "INVALID_ROUTE_TASK_CITY" };
    } else {
      try {
        const result = await this.scheduler.run(task.physicalKey, () => this.ticketTool(request));
        if (result.options.some((option) => option.mode !== task.mode)) {
          outcome = { status: "terminal_failure", code: "GATEWAY_EVIDENCE_MISMATCH" };
        } else {
          const quotesById = new Map(result.options.map((option) => [option.quoteId, option]));
          const quotes = [...quotesById.values()].map((option) => ({
            id: deterministicVerifiedQuoteId(task.runId, task.participantId, option.quoteId),
            quoteId: option.quoteId,
            providerQuoteId: option.providerQuoteId,
            participantId: task.participantId,
            cityCode: task.cityCode,
            mode: option.mode,
            searchDate: task.searchDate,
            queriedAt: result.queriedAt,
            priceCny: option.priceCny,
            departAt: option.departAt,
            arriveAt: option.arriveAt,
            durationMinutes: option.durationMinutes,
            transferCount: option.transferCount,
            isDirect: option.isDirect,
            serviceName: option.serviceName,
          })).filter((quote) => validateArrivalDate(quote, task.arrivalDate).ok);
          outcome = quotes.length > 0 ? { status: "success", quotes } : { status: "empty" };
        }
      } catch (error) {
        outcome = errorOutcome(error);
      }
    }
    const validated = queryOutcomeSchema.parse(outcome);
    await this.repository.saveTaskOutcome(taskId, validated);
    if (validated.status === "retryable_failure" && validated.retryAfterMs > 0) {
      await this.repository.updateRunStatus(
        task.runId,
        "cooling_down",
        new Date(Date.now() + validated.retryAfterMs).toISOString(),
      );
    }
    return validated;
  }
}
