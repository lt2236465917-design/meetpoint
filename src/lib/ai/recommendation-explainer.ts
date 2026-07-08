import { z } from "zod";
import type { CityRecommendation } from "@/types/domain";
import { createDeepSeekClient } from "./deepseek-client";

const explanationSchema = z.object({
  short_reason: z.string(),
  risk_badges: z.array(z.string()),
  share_summary: z.string(),
  detail_explanation: z.string(),
});

export type RecommendationExplanation = z.infer<typeof explanationSchema>;

export function fallbackExplanation(
  recommendation: CityRecommendation,
): RecommendationExplanation {
  const badges: string[] = [];
  if (recommendation.estimatePenalty > 0) badges.push("含估算");
  if (recommendation.transferPenalty > 0) badges.push("含中转");
  if (recommendation.waitingPenalty > 0) badges.push("等待较久");

  return {
    short_reason: `${recommendation.cityName}在价格、耗时和公平度之间较均衡。`,
    risk_badges: badges,
    share_summary: `${recommendation.cityName}：人均约 ¥${recommendation.avgPriceCny}，总价约 ¥${recommendation.totalPriceCny}。`,
    detail_explanation: `该城市总去程约 ¥${recommendation.totalPriceCny}，人均约 ¥${recommendation.avgPriceCny}。请在购票前重新核对实时价格。`,
  };
}

export async function explainRecommendation(
  recommendation: CityRecommendation,
): Promise<RecommendationExplanation> {
  const client = createDeepSeekClient();
  if (!client) return fallbackExplanation(recommendation);

  try {
    const response = await client.chat.completions.create({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你只根据输入的结构化推荐结果生成中文解释，不编造票价、车次或事实。输出 JSON。",
        },
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
