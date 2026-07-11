import OpenAI from "openai";

const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

export function getDeepSeekModel(): string {
  return process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL;
}

export function createDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ baseURL: "https://api.deepseek.com", apiKey });
}
