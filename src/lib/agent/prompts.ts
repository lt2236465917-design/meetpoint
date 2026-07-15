import { CITIES } from "@/data/cities";

import type { ValidationDecision, VerifiedQuote } from "@/lib/agent/contracts";

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
    "只可返回 approve 或有限的 correct 代码。任何确定性校验失败、覆盖不完整、日期不符、未知报价、估算或方案结构不符时不得批准。",
  ].join("\n");
}

export type ExplanationFactInput = {
  quotes: readonly VerifiedQuote[];
  cityCodes: readonly string[];
};

function allowedCityNames(cityCodes: readonly string[]): Set<string> {
  return new Set(
    CITIES.filter((city) => cityCodes.includes(city.code)).map((city) => city.name),
  );
}

function allMatches(text: string, expression: RegExp): string[] {
  return [...text.matchAll(expression)].map((match) => match[0]);
}

export function validateExplanationFacts(
  explanationZh: string,
  input: ExplanationFactInput,
): ValidationDecision {
  const allowedServices = new Set(input.quotes.map((quote) => quote.serviceName));
  const allowedCurrency = new Set(input.quotes.map((quote) => `${quote.priceCny}元`));
  const allowedDuration = new Set(input.quotes.map((quote) => `${quote.durationMinutes}分钟`));
  const allowedTimes = new Set(input.quotes.flatMap((quote) => [
    quote.departAt.slice(11, 16),
    quote.arriveAt.slice(11, 16),
  ]));
  const allowedCities = allowedCityNames(input.cityCodes);

  const unsupported = [
    ...allMatches(explanationZh, /\d+(?:\.\d+)?\s*(?:元|块|CNY|人民币)/giu)
      .filter((token) => !allowedCurrency.has(token.replace(/\s+/g, ""))),
    ...allMatches(explanationZh, /\b[A-Z]{1,4}\d{1,6}\b/g)
      .filter((token) => !allowedServices.has(token)),
    ...allMatches(explanationZh, /\b\d{1,2}:\d{2}\b/g)
      .filter((token) => !allowedTimes.has(token)),
    ...allMatches(explanationZh, /\d+\s*分钟/g)
      .filter((token) => !allowedDuration.has(token.replace(/\s+/g, ""))),
    ...CITIES.map((city) => city.name)
      .filter((cityName) => explanationZh.includes(cityName) && !allowedCities.has(cityName)),
  ];
  return unsupported.length === 0
    ? { ok: true }
    : { ok: false, codes: ["EXPLANATION_UNSUPPORTED_FACT"] };
}
