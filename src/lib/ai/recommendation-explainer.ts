import { z } from "zod";
import type { CityRecommendation } from "@/types/domain";
import { createDeepSeekClient, getDeepSeekModel } from "./deepseek-client";

const chineseTextSchema = z.string().trim().min(1).regex(/\p{Script=Han}/u);

const explanationSchema = z.object({
  short_reason: chineseTextSchema,
  risk_badges: z.array(chineseTextSchema),
  share_summary: chineseTextSchema,
  detail_explanation: chineseTextSchema,
}).strict();

const explanationSystemPrompt = `你只根据输入的结构化推荐结果生成中文解释，不编造票价、车次、航班、时刻或其他事实。
必须输出 JSON，且只能包含以下结构：
{
  "short_reason": "一句简短推荐理由",
  "risk_badges": ["风险标签"],
  "share_summary": "一句可分享摘要",
  "detail_explanation": "一段详细解释"
}`;

export type RecommendationExplanation = z.infer<typeof explanationSchema>;

export function fallbackExplanation(
  recommendation: CityRecommendation,
): RecommendationExplanation {
  const badges: string[] = [];
  if (recommendation.estimatePenalty > 0) badges.push("含估算");
  if (recommendation.transferPenalty > 0) badges.push("含中转");
  if (recommendation.waitingPenalty > 0) badges.push("等待较久");

  const duration = formatDuration(recommendation.totalDurationMinutes);

  return {
    short_reason: `${recommendation.cityName}团队总路费约 ¥${recommendation.totalPriceCny}，总耗时约 ${duration}，费用差约 ¥${recommendation.fairnessGap}。`,
    risk_badges: badges,
    share_summary: `${recommendation.cityName}：团队总路费约 ¥${recommendation.totalPriceCny}，费用差约 ¥${recommendation.fairnessGap}。`,
    detail_explanation: `该城市团队总去程约 ¥${recommendation.totalPriceCny}。请在购票前重新核对实时价格。`,
  };
}

function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "暂无";
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours === 0) return `${restMinutes}分钟`;
  if (restMinutes === 0) return `${hours}小时`;
  return `${hours}小时${restMinutes}分钟`;
}

export async function explainRecommendation(
  recommendation: CityRecommendation,
): Promise<RecommendationExplanation> {
  const client = createDeepSeekClient();
  if (!client) return fallbackExplanation(recommendation);

  try {
    const response = await client.chat.completions.create({
      model: getDeepSeekModel(),
      response_format: { type: "json_object" },
      max_tokens: 800,
      messages: [
        { role: "system", content: explanationSystemPrompt },
        { role: "user", content: JSON.stringify(recommendation) },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return fallbackExplanation(recommendation);
    const parsed = explanationSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : fallbackExplanation(recommendation);
  } catch {
    return fallbackExplanation(recommendation);
  }
}
