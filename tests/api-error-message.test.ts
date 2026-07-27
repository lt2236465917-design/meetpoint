import { describe, expect, it } from "vitest";
import { getApiErrorMessage } from "@/lib/ui/api-error-message";

describe("getApiErrorMessage", () => {
  it("maps API error codes to Chinese meetup-framed copy", () => {
    expect(getApiErrorMessage("INVALID_INPUT", "创建失败")).toBe(
      "请检查必填信息是否完整",
    );
    expect(getApiErrorMessage("PLAN_NOT_FOUND", "打开失败")).toBe(
      "计划不存在或已失效",
    );
    expect(getApiErrorMessage("INVALID_PARTICIPANT_TOKEN", "失败")).toBe(
      "先加入这场见面，才能开始哦",
    );
    expect(getApiErrorMessage("PLAN_CODE_EXHAUSTED", "失败")).toBe(
      "刚好撞上重复编号，请再创建一次",
    );
    expect(getApiErrorMessage("PARTICIPANT_LIMIT_NOT_REACHED", "失败")).toBe(
      "人数填满后才能开始见面",
    );
    expect(getApiErrorMessage("CALCULATION_FAILED", "失败")).toBe(
      "这次没安排成，稍后再试一次",
    );
    expect(getApiErrorMessage("CALCULATION_IN_PROGRESS", "失败")).toBe(
      "正在替大家查真实车票和机票，页面稍后会自己更新",
    );
    expect(getApiErrorMessage("NOT_ENOUGH_PARTICIPANTS", "失败")).toBe(
      "至少需要 2 个人填写后才能开始",
    );
    expect(getApiErrorMessage("RUN_NOT_FOUND", "失败")).toBe("还没有见面结果");
    expect(getApiErrorMessage("REAL_QUOTE_COVERAGE_INCOMPLETE", "失败")).toBe(
      "有几位朋友的票价没查全，过一会再试一次",
    );
    expect(getApiErrorMessage("AGENT_PROPOSAL_INVALID", "失败")).toBe(
      "方案没通过对大家更公平的核对，请再点一次「开始见面」",
    );
    expect(getApiErrorMessage("PUBLICATION_GUARD_REJECTED", "失败")).toBe(
      "方案没通过对大家更公平的核对，请再点一次「开始见面」",
    );
    expect(getApiErrorMessage("SHARED_RESULT_EXISTS", "失败")).toBe(
      "已经选好见面城市了，去看结果或换个城市看看",
    );
    expect(getApiErrorMessage("SHARED_RESULT_REQUIRED", "失败")).toBe(
      "先完成第一次见面安排，再换个城市看看",
    );
    expect(getApiErrorMessage("PREVIEW_EXPIRED", "失败")).toBe(
      "这份预览已经过期，请重新生成一次",
    );
  });

  it("uses fallback copy for unknown errors", () => {
    expect(getApiErrorMessage("SOMETHING_ELSE", "操作失败")).toBe("操作失败");
  });
});
