# DeepSeek Integration Design

## Goal

Complete the real DeepSeek explanation path while preserving deterministic ticket lookup, candidate generation, and ranking. DeepSeek may only generate explanation, risk-summary, and share copy from an already computed `CityRecommendation`.

## Scope

This change covers:

- server-side DeepSeek client configuration;
- structured explanation generation and validation;
- deterministic fallback behavior;
- the existing `POST /api/plans/[code]/explain` path;
- automated tests and one local real-API smoke check.

It does not change travel providers, city data, scoring, recommendation ordering, result-page UI, or API response shapes.

## Approaches Considered

### Fixed model name

Keep `deepseek-v4-flash` hard-coded and only improve the prompt and validation. This minimizes the diff but requires a code release for any future model change.

### Environment-configurable model with a safe default

Use `DEEPSEEK_MODEL` when configured and otherwise default to `deepseek-v4-flash`. This keeps the normal setup simple while allowing an operational model switch without changing application code.

This is the selected approach.

### Direct HTTP integration

Call the DeepSeek endpoint without the OpenAI SDK. This would add custom request, timeout, response, and error handling without providing a current product benefit.

## Architecture

`src/lib/ai/deepseek-client.ts` remains the only client-construction boundary. It reads server-side environment variables and returns `null` when no API key is configured. The model choice is exposed through a small configuration helper so it can be tested independently without leaking credentials.

`src/lib/ai/recommendation-explainer.ts` remains the only model-use boundary. It sends an already computed `CityRecommendation`, requests JSON output, validates the returned value, and returns deterministic fallback copy for every failure mode.

The calculation flow and `POST /api/plans/[code]/explain` continue calling `explainRecommendation`. Neither caller knows whether the returned explanation came from DeepSeek or the fallback path, and neither permits the model to change stored scores or city ordering.

## Model Request Contract

- Base URL: `https://api.deepseek.com`.
- Default model: `deepseek-v4-flash`.
- Optional override: server-only `DEEPSEEK_MODEL`.
- API format: OpenAI-compatible Chat Completions.
- Response format: `{ "type": "json_object" }`.
- Output length: an explicit bounded `max_tokens` sufficient for the four short Chinese fields.
- Per-attempt timeout: 15 seconds.
- SDK retries: at most one.
- Prompt: explicitly contains the word `JSON`, lists every required field, and includes a complete example object.

The system instruction states that the model may only explain supplied structured values and must not invent prices, schedules, service names, or other facts.

## Output Contract

The response must be a JSON object with exactly these fields:

- `short_reason`: non-empty Chinese string;
- `risk_badges`: array of non-empty Chinese strings;
- `share_summary`: non-empty Chinese string;
- `detail_explanation`: non-empty Chinese string.

Zod validates the parsed value. Every prose field and each risk badge must contain at least one Han character. Unknown fields are rejected to keep the model contract narrow. The returned object is used only for explanation-related persistence.

## Failure Handling

The deterministic fallback is returned when:

- `DEEPSEEK_API_KEY` is missing;
- the request fails or times out at the SDK layer;
- DeepSeek returns no content;
- JSON parsing fails;
- required fields are missing, empty, or have the wrong type;
- the response contains fields outside the agreed contract.

Fallback copy continues deriving only from `CityRecommendation`. Model failures do not fail recommendation calculation or the explain endpoint.

## API Behavior

`POST /api/plans/[code]/explain` keeps its current request and response contract:

```json
{
  "ok": true,
  "count": 3
}
```

The route continues updating only `explanation` and `risk_summary` on the latest run's recommendation rows. Plan-not-found and run-not-found behavior remains unchanged.

## Environment and Security

- `DEEPSEEK_API_KEY` remains server-only and is stored locally in `.env.local` or in the deployment secret manager.
- `DEEPSEEK_MODEL` is optional and server-only.
- No secret or raw provider response is logged, returned to the browser, committed, or included in test fixtures.
- `.env.local` remains ignored by Git.

## Testing

Automated tests will cover:

1. no API key returns deterministic fallback copy;
2. the default model and request contract are sent to the SDK;
3. `DEEPSEEK_MODEL` overrides the default;
4. valid structured JSON is returned;
5. malformed JSON returns fallback copy;
6. empty content returns fallback copy;
7. schema-invalid output returns fallback copy;
8. SDK failure returns fallback copy;
9. English-only prose or risk badges return fallback copy;
10. the client uses the 15-second timeout and one-retry limit;
11. the explain route preserves its existing persistence and response behavior.

Tests will mock the SDK boundary and will not access the network. After automated verification, one local smoke command will use the configured key to request an explanation and validate the response without printing the key or raw response.

## Acceptance Criteria

- A configured valid key reaches `deepseek-v4-flash` by default and produces a schema-valid explanation.
- An optional `DEEPSEEK_MODEL` value changes only the model identifier used for the request.
- Missing credentials or any invalid provider response returns deterministic fallback copy.
- DeepSeek never changes tickets, candidate cities, scores, or ranking order.
- `npm run lint`, `npm run test`, and `npm run build` pass.
- The real-API smoke check succeeds without exposing credentials.
