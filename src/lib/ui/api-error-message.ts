const apiErrorMessages: Record<string, string> = {
  INVALID_INPUT: "请检查必填信息是否完整",
  PLAN_NOT_FOUND: "计划不存在或已失效",
  PARTICIPANT_LIMIT_REACHED: "人数已满，不能继续加入",
  MANAGEMENT_TOKEN_REQUIRED: "请输入管理口令",
  INVALID_MANAGEMENT_TOKEN: "管理口令不正确",
  CREATE_PLAN_FAILED: "创建失败，请稍后重试",
  CREATE_PARTICIPANT_FAILED: "提交失败，请稍后重试",
  SAVE_CANDIDATE_FAILED: "保存失败，请稍后重试",
  CALCULATION_FAILED: "计算失败，请稍后重试",
  NOT_ENOUGH_PARTICIPANTS: "至少需要 2 个人填写后才能计算",
  RUN_NOT_FOUND: "还没有计算结果",
};

export function getApiErrorMessage(
  errorCode: unknown,
  fallbackMessage: string,
): string {
  if (typeof errorCode !== "string") return fallbackMessage;
  return apiErrorMessages[errorCode] ?? fallbackMessage;
}
