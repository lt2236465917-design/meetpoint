const apiErrorMessages: Record<string, string> = {
  INVALID_INPUT: "请检查必填信息是否完整",
  PLAN_NOT_FOUND: "计划不存在或已失效",
  PARTICIPANT_LIMIT_REACHED: "人数已满，不能继续加入",
  PARTICIPANT_TOKEN_REQUIRED: "请先填写你的出发信息",
  INVALID_PARTICIPANT_TOKEN: "只有填写过这份计划的人可以计算",
  PARTICIPANT_LIMIT_NOT_REACHED: "人数填满后才能开始计算",
  CREATE_PLAN_FAILED: "创建失败，请稍后重试",
  CREATE_PARTICIPANT_FAILED: "提交失败，请稍后重试",
  CANDIDATE_EDITING_UNAVAILABLE: "当前版本不支持手动调整候选城市",
  CALCULATION_FAILED: "计算失败，请稍后重试",
  CALCULATION_IN_PROGRESS: "正在查询票价并生成结果，请稍后自动刷新。",
  NOT_ENOUGH_PARTICIPANTS: "至少需要 2 个人填写后才能计算",
  RUN_NOT_FOUND: "还没有计算结果",
  REAL_QUOTE_COVERAGE_INCOMPLETE: "真实票价覆盖不完整，可以重新计算",
  AGENT_PROPOSAL_INVALID: "方案核验未通过，请重新计算",
  PUBLICATION_GUARD_REJECTED: "结果未通过发布核验，请重新计算",
};

export function getApiErrorMessage(
  errorCode: unknown,
  fallbackMessage: string,
): string {
  if (typeof errorCode !== "string") return fallbackMessage;
  return apiErrorMessages[errorCode] ?? fallbackMessage;
}
