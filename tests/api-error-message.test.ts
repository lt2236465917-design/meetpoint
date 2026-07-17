import { describe, expect, it } from "vitest";
import { getApiErrorMessage } from "@/lib/ui/api-error-message";

describe("getApiErrorMessage", () => {
  it("maps API error codes to Chinese user-facing copy", () => {
    expect(getApiErrorMessage("INVALID_INPUT", "创建失败")).toBe(
      "请检查必填信息是否完整",
    );
    expect(getApiErrorMessage("PLAN_NOT_FOUND", "打开失败")).toBe(
      "计划不存在或已失效",
    );
    expect(getApiErrorMessage("PARTICIPANT_LIMIT_NOT_REACHED", "计算失败")).toBe(
      "人数填满后才能开始计算",
    );
    expect(getApiErrorMessage("CALCULATION_IN_PROGRESS", "计算失败")).toBe(
      "正在查票和算方案，页面稍后会自动刷新。",
    );
  });

  it("uses fallback copy for unknown errors", () => {
    expect(getApiErrorMessage("SOMETHING_ELSE", "操作失败")).toBe("操作失败");
  });
});
