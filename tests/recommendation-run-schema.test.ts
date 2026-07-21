import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const activeGuard = "recommendation_runs_one_active_per_plan";
const atomicRunCreationPaths = [
  "supabase/schema.sql",
  "supabase/migrations/202607210001_publication_safety_and_run_recovery.sql",
];

const lockOrderCases = atomicRunCreationPaths.flatMap((path) => [
  [path, "create_recommendation_run_matrix"],
  [path, "publish_shared_result"],
  [path, "confirm_alternative_result"],
] as const);

function extractFunction(sql: string, functionName: string) {
  const declaration = new RegExp(
    `create(?: or replace)? function\\s+(?:public\\.)?${functionName}\\s*\\(`,
    "i",
  );
  const start = sql.search(declaration);
  if (start < 0) throw new Error(`Missing function: ${functionName}`);
  const end = sql.indexOf("\n$$;", start);
  if (end < 0) throw new Error(`Unterminated function: ${functionName}`);
  return sql.slice(start, end + "\n$$;".length).toLowerCase();
}

function findRowLock(functionSql: string, tableName: string) {
  let statementStart = 0;
  for (const terminator of functionSql.matchAll(/;/g)) {
    const statementEnd = terminator.index ?? -1;
    const statement = functionSql.slice(statementStart, statementEnd);
    if (
      statement.includes(`from public.${tableName}`)
      && statement.includes("for update")
    ) {
      return statementStart + statement.lastIndexOf("for update");
    }
    statementStart = statementEnd + 1;
  }
  return -1;
}

describe("active recommendation run database guard", () => {
  it("replaces the historical running-only index with the active-state guard", async () => {
    const [schema, legacyMigration, multiAgentMigration] = await Promise.all([
      readFile("supabase/schema.sql", "utf8"),
      readFile("supabase/migrations/202607140001_add_running_recommendation_run_guard.sql", "utf8"),
      readFile(
        "supabase/migrations/202607150001_multi_agent_recommendation.sql",
        "utf8",
      ),
    ]);

    for (const sql of [schema.toLowerCase(), multiAgentMigration.toLowerCase()]) {
      expect(sql).toContain(activeGuard);
      expect(sql).toContain("on recommendation_runs (plan_id)");
      expect(sql).toContain("'awaiting_host_confirmation'");
    }

    expect(legacyMigration.toLowerCase()).toContain(
      "recommendation_runs_one_running_per_plan",
    );
    expect(multiAgentMigration.toLowerCase()).toContain(
      "drop index if exists recommendation_runs_one_running_per_plan",
    );
    expect(schema.toLowerCase()).not.toContain(
      "recommendation_runs_one_running_per_plan",
    );
  });

  it("returns structured atomic run-creation outcomes and tracks stale runs", async () => {
    for (const path of atomicRunCreationPaths) {
      const sql = (await readFile(path, "utf8")).toLowerCase();

      expect(sql).toContain("'disposition', 'created'");
      expect(sql).toContain("'disposition', 'resume_existing'");
      expect(sql).toContain("'disposition', 'rejected'");
      expect(sql).toContain("'code', 'shared_result_exists'");
      expect(sql).toContain("'code', 'shared_result_required'");
      expect(sql).toContain("'code', 'calculation_in_progress'");
      expect(sql).toContain("for update");
      expect(sql).toContain("stale_after");
    }
  });

  it("validates the bounded run matrix before locking and verifies plan ownership after locking", async () => {
    for (const path of atomicRunCreationPaths) {
      const sql = (await readFile(path, "utf8")).toLowerCase();
      const candidateValidation = sql.indexOf("raise exception 'invalid candidate matrix'");
      const taskValidation = sql.indexOf("raise exception 'invalid route task matrix'");
      const planSelect = sql.indexOf("select public.plans.meeting_date");
      const planLock = sql.indexOf("for update;", planSelect);
      const meetingDateValidation = sql.indexOf("raise exception 'plan arrival date mismatch'");
      const requesterValidation = sql.indexOf(
        "raise exception 'alternative requester is not a plan participant'",
      );

      expect(candidateValidation).toBeGreaterThan(-1);
      expect(taskValidation).toBeGreaterThan(-1);
      expect(planSelect).toBeGreaterThan(-1);
      expect(planLock).toBeGreaterThan(-1);
      expect(meetingDateValidation).toBeGreaterThan(-1);
      expect(requesterValidation).toBeGreaterThan(-1);
      expect(candidateValidation).toBeLessThan(planSelect);
      expect(taskValidation).toBeLessThan(planSelect);
      expect(planSelect).toBeLessThan(planLock);
      expect(planLock).toBeLessThan(meetingDateValidation);
      expect(planLock).toBeLessThan(requesterValidation);
    }
  });

  it.each(lockOrderCases)(
    "%s locks the plan before recommendation runs in %s",
    async (path, functionName) => {
      const sql = await readFile(path, "utf8");
      const functionSql = extractFunction(sql, functionName);
      const planLock = findRowLock(functionSql, "plans");
      const runLock = findRowLock(functionSql, "recommendation_runs");

      expect(planLock).toBeGreaterThan(-1);
      expect(runLock).toBeGreaterThan(-1);
      expect(planLock).toBeLessThan(runLock);
    },
  );
});
