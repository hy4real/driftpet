# driftpet

Mac 可爱桌面陪伴宠。它先陪你待在桌面上，顺手帮你收住链接、碎片想法和乱糟糟的小纸条。

Current V1 shape:

- Boba 风格的小桌宠常驻桌面，可拖拽、戳一下、睡一会儿。
- 你可以把文字或 URL 从手机转发到 Telegram，也可以直接放进 driftpet 的“小窝”。
- 它会把输入收成一张小纸条：一个可以先做的下一步、一点标签、几句宠物备注。
- 它会把旧内容放进“记忆”，需要时再让你翻出来。
- 新内容默认低打扰：先轻轻提示，点开后再看详情。
- 详细的 Telegram / LLM / embeddings / storage 状态还在，但默认藏在“详细状态”里。

## Local setup

1. Create a local env file:

```bash
cp .env.example .env
```

2. Fill in the provider block you want.

3. Install dependencies:

```bash
npm install
```

4. Start the app:

```bash
npm run dev
```

5. Optional verification:

```bash
node scripts/overnight-goal.mjs
```

6. App-equivalent status probe:

```bash
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -e "const { getAppStatus } = require('./dist-electron/src/main/status/app-status.js'); getAppStatus().then((status)=>console.log(JSON.stringify(status, null, 2)));"
```

## Provider options

### Anthropic

```env
DRIFTPET_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
DRIFTPET_DIGEST_MODEL=claude-sonnet-4-20250514
DRIFTPET_REMARK_MODEL=claude-sonnet-4-20250514
```

### OpenAI / Codex

```env
DRIFTPET_LLM_PROVIDER=openai
OPENAI_API_KEY=...
DRIFTPET_DIGEST_MODEL=your-openai-model
DRIFTPET_REMARK_MODEL=your-openai-model
```

### DeepSeek or other OpenAI-compatible APIs

```env
DRIFTPET_LLM_PROVIDER=openai-compatible
DEEPSEEK_API_KEY=...
DRIFTPET_LLM_BASE_URL=https://api.deepseek.com/v1
DRIFTPET_DIGEST_MODEL=deepseek-chat
DRIFTPET_REMARK_MODEL=deepseek-chat
```

### Local Ollama embeddings

```env
DRIFTPET_EMBED_PROVIDER=ollama
DRIFTPET_EMBED_BASE_URL=http://127.0.0.1:11434
DRIFTPET_EMBED_MODEL=qwen3-embedding:0.6b
```

## Notes

- If `TELEGRAM_BOT_TOKEN` is empty, driftpet still runs, but Telegram polling stays off.
- If no LLM key is configured, driftpet still creates a simple local placeholder note and records the reason in `items.last_error`.
- Memory recall can use a different provider than the main note-making model.
- For split setups, keep your relay key on `DRIFTPET_LLM_API_KEY` and put your separate OpenAI embeddings key on `DRIFTPET_EMBED_API_KEY`.
- Synthetic verification items are kept separate from real items and are filtered out of normal related-memory recall.
- `better-sqlite3` is ABI-sensitive between system Node and Electron. For app-equivalent smoke tests, prefer Electron runtime probes.

## Workflow

This repo's real execution source of truth stays in `.omx/`.
The `workflow-fusion/` folder is adapted here as a thin protocol layer for structured task packets, fixed report shapes, and append-only task events.

Use it like this:

```bash
npm run hooks:install
npm run workflow:refresh
npm run workflow:status
npm run workflow:check
```

`workflow:refresh` now exports the current overnight-loop Ralph task into `.workflow/runtime/`, runs the Workflow Fusion guards, runs repo verification, writes the latest structured report, and appends runtime events without replacing `.omx`.
`npm run test:lore` covers Lore commit-message validation.
`npm run test:workflow` covers the bridge's task/report/status shaping logic with zero-dependency Node tests.
`npm run workflow:check` exits non-zero when the workflow projection is stale or blocked.
`npm run hooks:install` points local git hooks at `.githooks/`, where pre-commit runs the workflow health gate.
`.githooks/commit-msg` validates Lore commit format before a commit is accepted.
Details are in `docs/workflow-fusion-adoption.md`.

## What the app currently does

- `Desktop companion`: Boba 风格的小宠物在桌面陪着你，支持拖拽、戳一下、睡一会儿和随机小动作。
- `Nest input`: 你可以把乱糟糟的文字、链接、想法放进“小窝”，它会先说“我收下啦”，再整理成小纸条。
- `Telegram capture`: polls your bot with long polling and stores text / URL inputs locally.
- `Little notes`: turns a capture into a compact card with a suggested next step, a tag, and a pet remark. When the model falls back, the local copy still tracks the input language.
- `Pet memory`: recalls a small number of prior real cards and presents them as things driftpet remembers, not as a raw database list.
- `Low-interruption surfacing`: new content first becomes a gentle pending note; opening the pet reveals the full card.
- `Status`: the status drawer first shows the pet's own state, with Telegram / LLM / embeddings / storage details available behind a toggle.
- `Generated brief`: `node scripts/overnight-goal.mjs` regenerates a morning brief and JSON verification snapshot under `reports/`.

## Current limitations

- The product is now intentionally companion-first; some older internal names still say digest / chaos / capture.
- Real-world prompt tuning is still lightweight; the best next improvement is more real captures and calmer output, not more feature branches.
- URL extraction still needs another live pass on a wider variety of real pages.
- Real usage tuning is still in progress for when recall should stay empty instead of forcing a weak memory link.
- The pet's sense of aliveness has improved with Boba, idle reactions, and lighter copy, but richer long-lived personality is still future work.
- The generated morning brief in `reports/` is useful for local review, but `reports/` is intentionally gitignored.

## Recommended split setup

Use this when your text model goes through a relay like Beehears, but embeddings should come from OpenAI directly.

```env
DRIFTPET_LLM_PROVIDER=openai
DRIFTPET_LLM_API_KEY=your-relay-key
DRIFTPET_LLM_ENDPOINT=https://your-relay.example/v1/responses
DRIFTPET_DIGEST_MODEL=gpt-5.5
DRIFTPET_REMARK_MODEL=gpt-5.5

DRIFTPET_EMBED_PROVIDER=openai
DRIFTPET_EMBED_API_KEY=your-openai-key
DRIFTPET_EMBED_MODEL=text-embedding-3-small
```

## Recommended local embedding setup

Use this when your text model goes through a relay, but related-memory recall should stay on your Mac.

```env
DRIFTPET_LLM_PROVIDER=openai
DRIFTPET_LLM_API_KEY=your-relay-key
DRIFTPET_LLM_ENDPOINT=https://your-relay.example/v1/responses
DRIFTPET_DIGEST_MODEL=gpt-5.5
DRIFTPET_REMARK_MODEL=gpt-5.5

DRIFTPET_EMBED_PROVIDER=ollama
DRIFTPET_EMBED_BASE_URL=http://127.0.0.1:11434
DRIFTPET_EMBED_MODEL=qwen3-embedding:0.6b
```
