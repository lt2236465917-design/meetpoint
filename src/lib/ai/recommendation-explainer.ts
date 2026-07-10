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
