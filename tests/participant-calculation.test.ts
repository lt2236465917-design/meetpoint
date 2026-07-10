import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "@/lib/security/tokens";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  planSingle: vi.fn(),
  participantsEq: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseEnvironment: () => true,
  createServiceSupabaseClient: () => ({
    from: mocks.from,
  }),
}));

function mockPlanLookup(
  plan: { id: string; participant_limit: number } | null,
) {
  mocks.planSingle.mockResolvedValue({ data: plan });
  const single = vi.fn(() => mocks.planSingle());
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, single };
}

function mockParticipants(
  participants: Array<{ id: string; edit_token_hash: string }>,
) {
  mocks.participantsEq.mockResolvedValue({ data: participants });
  const select = vi.fn(() => ({ eq: mocks.participantsEq }));
  return { select };
}

describe("verifyParticipantCanCalculatePlan", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
    mocks.planSingle.mockReset();
    mocks.participantsEq.mockReset();
  });

  it("requires a participant token before reading plan data", async () => {
    const { verifyParticipantCanCalculatePlan } = await import(
      "@/lib/security/participant-calculation"
    );

    await expect(
      verifyParticipantCanCalculatePlan({
        code: "ABC123",
        participantToken: null,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 401,
      error: "PARTICIPANT_TOKEN_REQUIRED",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects calculation before the plan reaches its participant limit", async () => {
    const planLookup = mockPlanLookup({ id: "plan-1", participant_limit: 2 });
    const participantLookup = mockParticipants([
      {
        id: "participant-1",
        edit_token_hash: await hashToken("edit-token"),
      },
    ]);
    mocks.from
      .mockReturnValueOnce({ select: planLookup.select })
      .mockReturnValueOnce({ select: participantLookup.select });

    const { verifyParticipantCanCalculatePlan } = await import(
      "@/lib/security/participant-calculation"
    );

    await expect(
      verifyParticipantCanCalculatePlan({
        code: "ABC123",
        participantToken: "edit-token",
      }),
    ).resolves.toEqual({
      ok: false,
      status: 409,
      error: "PARTICIPANT_LIMIT_NOT_REACHED",
    });
  });

  it("allows a filled participant to calculate after the plan is full", async () => {
    const planLookup = mockPlanLookup({ id: "plan-1", participant_limit: 2 });
    const participantLookup = mockParticipants([
      {
        id: "participant-1",
        edit_token_hash: await hashToken("edit-token"),
      },
      {
        id: "participant-2",
        edit_token_hash: await hashToken("other-token"),
      },
    ]);
    mocks.from
      .mockReturnValueOnce({ select: planLookup.select })
      .mockReturnValueOnce({ select: participantLookup.select });

    const { verifyParticipantCanCalculatePlan } = await import(
      "@/lib/security/participant-calculation"
    );

    await expect(
      verifyParticipantCanCalculatePlan({
        code: "ABC123",
        participantToken: "edit-token",
      }),
    ).resolves.toEqual({
      ok: true,
      planId: "plan-1",
      participantId: "participant-1",
    });
  });

  it("rejects tokens that do not belong to filled participants", async () => {
    const planLookup = mockPlanLookup({ id: "plan-1", participant_limit: 1 });
    const participantLookup = mockParticipants([
      {
        id: "participant-1",
        edit_token_hash: await hashToken("edit-token"),
      },
    ]);
    mocks.from
      .mockReturnValueOnce({ select: planLookup.select })
      .mockReturnValueOnce({ select: participantLookup.select });

    const { verifyParticipantCanCalculatePlan } = await import(
      "@/lib/security/participant-calculation"
    );

    await expect(
      verifyParticipantCanCalculatePlan({
        code: "ABC123",
        participantToken: "wrong-token",
      }),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: "INVALID_PARTICIPANT_TOKEN",
    });
  });
});
