# Czech Learning

Apply the root `AGENTS.md` first. This workspace owns Czech vocabulary, imports and future learning features.

- Keep word models, dictionary routes, import validation, learning rules and UI in this app. Shared auth mechanics must not introduce news groups, Telegram dependencies, shared sessions or a shared database.
- Treat the [historical plan](../../plans/czech-learning/czech-learning-app.md) as requirements history, not an implementation checklist already completed. Inspect routes, schema and UI before claiming a planned feature exists.
- Preserve Czech diacritics, Czech/Russian vocabulary content, word-form metadata and optional English translations. Keep English and Russian UI resources consistent.
- Match the existing Drizzle schema/migration and authenticated-route patterns. Use app-local disposable data for migration/import validation; OCR/import scripts can write data and call external services.
- Use existing TanStack Query, Zustand and `antd-style` patterns. Vocabulary/import behavior must remain independent of news.
- Run focused commands from the repository root with `--workspace czech-learning`. Read the root README for ports and checks; retain unchecked plan criteria until the behavior has actually been verified.
