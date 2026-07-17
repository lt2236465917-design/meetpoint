const apiErrorMessages: Record<string, string> = {
  INVALID_INPUT: "请检查必填信息是否完整",
  PLAN_NOT_FOUND: "计划不存在或已失效",
  PARTICIPANT_LIMIT_REACHED: "这场见面的人已经齐了，没有空位啦",
  PARTICIPANT_TOKEN_REQUIRED: "请先填写你的出发信息",
  INVALID_PARTICIPANT_TOKEN: "先加入这场见面，才能发起计算哦",
  PARTICIPANT_LIMIT_NOT_REACHED: "人数填满后才能开始计算",
  CREATE_PLAN_FAILED: "创建失败，请稍后重试",
  CREATE_PARTICIPANT_FAILED: "提交失败，请稍后重试",
  CANDIDATE_EDITING_UNAVAILABLE: "当前版本不支持手动调整候选城市",
  CALCULATION_FAILED: "计算失败，请稍后重试",
  CALCULATION_IN_PROGRESS: "正在查票和算方案，页面稍后会自动刷新。",
  NOT_ENOUGH_PARTICIPANTS: "至少需要 2 个人填写后才能计算",
  RUN_NOT_FOUND: "还没有计算结果",
  REAL_QUOTE_COVERAGE_INCOMPLETE: "有几位朋友的票价没查全，再算一次试试",
  AGENT_PROPOSAL_INVALID: "方案没通过最后一道核对，请重新计算",
  PUBLICATION_GUARD_REJECTED: "方案没通过最后一道核对，请重新计算",
};

export function getApiErrorMessage(
  errorCode: unknown,
  fallbackMessage: string,
): string {
  if (typeof errorCode !== "string") return fallbackMessage;
  return apiErrorMessages[errorCode] ?? fallbackMessage;
}
