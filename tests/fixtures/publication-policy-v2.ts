export const policyV2Fixture = {
  arrivalDate: "2026-08-15",
  planId: "00000000-0000-4000-8000-000000000100",
  runId: "00000000-0000-4000-8000-000000000200",
  participantIds: [
    "00000000-0000-4000-8000-000000000101",
    "00000000-0000-4000-8000-000000000102",
  ] as const,
  taskIds: [
    "00000000-0000-4000-8000-000000000301",
    "00000000-0000-4000-8000-000000000302",
  ] as const,
} as const;

export const policyV2ParityQuotes = [
  {
    id: "00000000-0000-4000-8000-000000000401",
    participantId: policyV2Fixture.participantIds[0],
    taskId: policyV2Fixture.taskIds[0],
    quoteId: "direct",
    priceCny: 200,
    durationMinutes: 180,
  },
  {
    id: "00000000-0000-4000-8000-000000000402",
    participantId: policyV2Fixture.participantIds[0],
    taskId: policyV2Fixture.taskIds[0],
    quoteId: "transfer",
    priceCny: 50,
    durationMinutes: 60,
    transferCount: 1,
    isDirect: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000403",
    participantId: policyV2Fixture.participantIds[1],
    taskId: policyV2Fixture.taskIds[1],
    quoteId: "fixed",
  },
] as const satisfies readonly PolicyV2QuoteFixture[];

export const policyV2ParitySavingSelection = [
  {
    participantId: policyV2Fixture.participantIds[0],
    quoteId: "direct",
  },
  {
    participantId: policyV2Fixture.participantIds[1],
    quoteId: "fixed",
  },
] as const;

export type PolicyV2QuoteFixture = {
  id: string;
  participantId: string;
  taskId: string;
  quoteId: string;
  cityCode?: string;
  mode?: "flight" | "high_speed_rail" | "normal_train";
  searchDate?: string;
  priceCny?: number;
  durationMinutes?: number;
  transferCount?: number;
  isDirect?: boolean;
  departAt?: string;
  arriveAt?: string;
};

export function policyV2Quote(
  input: PolicyV2QuoteFixture,
): Required<PolicyV2QuoteFixture> {
  return {
    cityCode: "wuhan",
    mode: "high_speed_rail",
    searchDate: policyV2Fixture.arrivalDate,
    priceCny: 100,
    durationMinutes: 120,
    transferCount: 0,
    isDirect: true,
    departAt: "2026-08-15T08:00:00+08:00",
    arriveAt: "2026-08-15T10:00:00+08:00",
    ...input,
  };
}
