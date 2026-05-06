# driftpet

Mac desk pet for catching drift and compressing inputs into one next move.

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
- If no LLM key is configured, driftpet falls back to local placeholder digest generation and records the reason in `items.last_error`.
- Embedding-based related recall can use a different provider than the main digest model.
- For split setups, keep your relay key on `DRIFTPET_LLM_API_KEY` and put your separate OpenAI embeddings key on `DRIFTPET_EMBED_API_KEY`.

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
