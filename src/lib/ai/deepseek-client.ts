import OpenAI from "openai";

export function createDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  return new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey,
  });
}
