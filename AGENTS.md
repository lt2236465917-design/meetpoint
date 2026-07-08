# Project Rules

## Product

This project is a mobile-first Web H5 app for multi-person cross-city meeting planning in China.

## Development

- Use Chinese for user-facing copy.
- Use English for code, files, variables, and commit messages.
- Keep ticket lookup, city ranking, and scoring deterministic.
- Use DeepSeek only for explanation, risk summaries, and share text.
- Keep secrets in server-side environment variables only.
- Run `npm run lint`, `npm run test`, and `npm run build` before reporting completion after code changes.

## Structure

- `src/lib/travel/`: vendor adapters and normalized travel option types.
- `src/lib/recommendation/`: deterministic scoring and calculation orchestration.
- `src/lib/city/`: city search, distance, and candidate generation.
- `src/lib/ai/`: DeepSeek explanation helpers.
- `src/components/`: mobile-first UI components.
- `docs/superpowers/specs/`: approved product and technical design specs.
- `docs/superpowers/plans/`: implementation plans derived from approved specs.
