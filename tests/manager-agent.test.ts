import { describe, expect, it } from "vitest";

import { ManagerAgent } from "@/lib/agent/manager-agent";
import { deterministicRouteTaskId } from "@/lib/recommendation/repository";
import type {
  CandidateRecord,
  RecommendationRepository,
  StoredRouteTask,
} from "@/lib/recommendation/repository";

function managerRepository() {
  const candidates: CandidateRecord[] = [];
  const tasks: StoredRouteTask[] = [];
  const repository: RecommendationRepository = {
    async createRunMatrix(input) {
      candidates.push(...input.candidates);
      const runId = "11111111-1111-4111-8111-111111111111";
      tasks.push(...input.tasks.map((task) => ({
        ...task,
        id: deterministicRouteTaskId(runId, task),
        runId,
        status: "pending" as const,
        attemptCount: 0,
        retryAfter: null,
        errorCode: null,
      })));
      return { runId, taskIds: tasks.map((task) => task.id) };
    },
    async getRouteTask() { return null; },
    async markTaskRunning() { throw new Error("not used"); },
    async saveTaskOutcome() { throw new Error("not used"); },
    async updateRunStatus() {},
  };
  return { repository, candidates, tasks };
}

const validInput = {
  planId: "plan-1",
  arrivalDate: "2026-08-15",
  participants: [
    { id: "p2", departureCityCode: "beijing", departureCityName: "北京", acceptedModes: ["flight"] as const },
    { id: "p1", departureCityCode: "beijing", departureCityName: "北京", acceptedModes: ["flight"] as const },
  ],
};

describe("ManagerAgent", () => {
  it.each([
    ["missing city", { ...validInput, participants: [{ ...validInput.participants[0], departureCityCode: "" }, validInput.participants[1]] }],
    ["missing mode", { ...validInput, participants: [validInput.participants[0], { ...validInput.participants[1], acceptedModes: [] }] }],
  ])("rejects an incomplete participant: %s", async (_label, input) => {
    const { repository } = managerRepository();
    await expect(new ManagerAgent(repository).prepare(input)).rejects.toThrow("participants");
  });

  it("persists a deterministic candidate/task matrix and returns task IDs in order", async () => {
    const first = managerRepository();
    const second = managerRepository();

    const firstResult = await new ManagerAgent(first.repository).prepare(validInput);
    const secondResult = await new ManagerAgent(second.repository).prepare(validInput);

    expect(first.candidates.length).toBeGreaterThan(0);
    expect(first.tasks.length).toBeGreaterThan(0);
    expect(firstResult.taskIds).toEqual(first.tasks.map((task) => task.id));
    expect(firstResult.taskIds).toEqual(secondResult.taskIds);
    expect(first.tasks.every((task) => task.arrivalDate === "2026-08-15")).toBe(true);
    expect(first.tasks.map((task) => task.participantId)).toEqual(
      [...first.tasks.map((task) => task.participantId)].sort(),
    );
  });

  it("rejects duplicate participant IDs before persistence", async () => {
    const { repository, tasks } = managerRepository();
    await expect(new ManagerAgent(repository).prepare({
      ...validInput,
      participants: [validInput.participants[0], { ...validInput.participants[1], id: "p2" }],
    })).rejects.toThrow("participant");
    expect(tasks).toHaveLength(0);
  });
});
