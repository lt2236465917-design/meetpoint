import type { ValidationDecision, VerifiedQuote } from "@/lib/agent/contracts";

export const SAFE_EXPLANATIONS_ZH = [
  "已依据已验证报价及既定规则生成推荐方案。",
  "推荐方案仅使用已验证报价，并遵循既定规则。",
] as const;

export function buildCalculationSystemPrompt(input: {
  quoteIds: readonly string[];
  policyVersion: string;
}): string {
  return [
    "你是 Calculation Agent。你只能从以下已验证 quote_id 中选择路线：",
    input.quoteIds.join(", "),
    `政策版本：${input.policyVersion}。`,
    "先执行 direct-first：有直达路线时不得用换乘路线替代。",
    "省钱方案只可使用不超过该参与者最低票价 110% 的直达优先路线；省时方案团队票价不得超过省钱方案的 130%。",
    "城市排序依次为团队省钱总价、直达人数、票价公平差、团队时长、城市代码；不得引入权重。",
    "必须引用每位参与者在 saving 和 fast 中的 quote_id，并调用算术和证据校验。",
    "覆盖不完整时返回 incomplete 和缺失任务 ID；不得估算、推断或修改票价、时间、服务或供应商事实。",
    `说明文字只能逐字使用以下一句，不能加入城市、服务、时间、时长或票价：${SAFE_EXPLANATIONS_ZH.join(" 或 ")}`,
    '只输出一个 JSON 对象。proposal 格式示例：{"status":"proposal","cityCode":"<候选城市代码>","schemes":[{"kind":"saving","quoteIdsByParticipant":{"<参与者UUID>":"<已验证报价UUID>"},"totalFareCny":0},{"kind":"fast","quoteIdsByParticipant":{"<参与者UUID>":"<已验证报价UUID>"},"totalFareCny":0}],"comparisonEvidence":{"eligibleCityCodes":["<候选城市代码>"],"orderedCityCodes":["<候选城市代码>"]},"explanationZh":"已依据已验证报价及既定规则生成推荐方案。"}',
    "你不能发布结果或修改任何报价。",
  ].join("\n");
}

export function buildSupervisorSystemPrompt(input: {
  completeParticipantCount: number;
  participantCount: number;
  validationCodes: readonly string[];
  proposalVersion?: number;
  proposalId?: string;
}): string {
  return [
    "你是 Supervisor Agent，只能审核，不能修改报价或发布结果。",
    `覆盖人数：${input.completeParticipantCount}/${input.participantCount}。`,
    `提案版本：${input.proposalVersion ?? 0}。`,
    `提案标识：${input.proposalId ?? "未分配"}。`,
    `确定性校验代码：${input.validationCodes.length > 0 ? input.validationCodes.join(", ") : "无"}。`,
    '只输出一个 JSON 对象。批准格式示例：{"decision":"approve"}；纠正格式示例：{"decision":"correct","codes":["INVALID_PROPOSAL"]}。',
    "只可返回 approve 或有限的 correct 代码。任何确定性校验失败、覆盖不完整、日期不符、未知报价、估算或方案结构不符时不得批准。",
  ].join("\n");
}

export type ExplanationFactInput = {
  quotes: readonly VerifiedQuote[];
  cityCodes: readonly string[];
};

export function validateExplanationFacts(
  explanationZh: string,
  input: ExplanationFactInput,
): ValidationDecision {
  void input;
  return SAFE_EXPLANATIONS_ZH.includes(explanationZh.trim() as typeof SAFE_EXPLANATIONS_ZH[number])
    ? { ok: true }
    : { ok: false, codes: ["EXPLANATION_UNSUPPORTED_FACT"] };
}
