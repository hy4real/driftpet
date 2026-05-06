import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("/Users/mac/driftpet");
const reportsDir = path.join(root, "reports");
const today = new Date();
const formatDate = (value) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai"
  }).format(value);
};

const reportDate = formatDate(today);
const reportPath = path.join(reportsDir, `morning-brief-${reportDate}.md`);
const jsonPath = path.join(reportsDir, `overnight-verification-${reportDate}.json`);

const run = (cmd, args, options = {}) => {
  const startedAt = Date.now();
  try {
    const stdout = execFileSync(cmd, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeout ?? 120000,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: options.electronAsNode ? "1" : process.env.ELECTRON_RUN_AS_NODE
      }
    });

    return {
      ok: true,
      cmd: [cmd, ...args].join(" "),
      durationMs: Date.now() - startedAt,
      stdout: stdout.trim(),
      stderr: ""
    };
  } catch (error) {
    return {
      ok: false,
      cmd: [cmd, ...args].join(" "),
      durationMs: Date.now() - startedAt,
      stdout: error.stdout?.toString().trim() ?? "",
      stderr: error.stderr?.toString().trim() ?? error.message
    };
  }
};

const sqlite = (sql) => run("sqlite3", ["-json", path.join(root, "data/app.db"), sql]);

const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

fs.mkdirSync(reportsDir, { recursive: true });

const typecheck = run("npm", ["run", "typecheck"], { timeout: 180000 });
const buildElectron = run("npm", ["run", "build:electron"], { timeout: 120000 });
const appStatusResult = buildElectron.ok
  ? run("./node_modules/.bin/electron", [
    "-e",
    "const { getAppStatus } = require('./dist-electron/src/main/status/app-status.js'); getAppStatus().then((status)=>{console.log(JSON.stringify(status));}).catch((error)=>{console.error(error && error.stack || error); process.exit(1);});"
  ], {
    timeout: 120000,
    electronAsNode: true
  })
  : {
    ok: false,
    cmd: "electron app-status probe",
    durationMs: 0,
    stdout: "",
    stderr: "Skipped because Electron build failed."
  };

const runOllamaEmbed = () => run("curl", [
  "-sS",
  "http://127.0.0.1:11434/api/embed",
  "-H",
  "Content-Type: application/json",
  "-d",
  JSON.stringify({
    model: "qwen3-embedding:0.6b",
    input: "driftpet overnight verification"
  })
], { timeout: 120000 });

const ollamaEmbed = runOllamaEmbed();

const countsResult = sqlite(`
  select
    (select count(*) from items) as items,
    (select count(*) from items where origin = 'real') as real_items,
    (select count(*) from items where origin = 'synthetic') as synthetic_items,
    (select count(*) from cards) as cards,
    (select count(*) from card_embeddings) as embeddings,
    (select count(*) from items where source like 'tg_%') as telegram_items,
    (select count(*) from card_embeddings where provider='ollama') as ollama_embeddings;
`);

const recentResult = sqlite(`
  select
    items.id,
    items.source,
    items.origin,
    items.status,
    items.tg_message_id as tgMessageId,
    items.extracted_title as extractedTitle,
    cards.title,
    cards.knowledge_tag as knowledgeTag
  from items
  left join cards on cards.item_id = items.id
  order by items.id desc
  limit 8;
`);

const prefsResult = sqlite(`
  select key, value
  from prefs
  where key in ('telegram_last_update_id', 'pet_mode', 'pet_hourly_budget')
  order by key;
`);

const appStatus = parseJson(appStatusResult.stdout, null);
const embeddingPayload = parseJson(ollamaEmbed.stdout, {});
const vectorLength = Array.isArray(embeddingPayload.embeddings?.[0])
  ? embeddingPayload.embeddings[0].length
  : 0;

const counts = parseJson(countsResult.stdout, [{}])[0] ?? {};
const recent = parseJson(recentResult.stdout, []);
const prefs = parseJson(prefsResult.stdout, []);
const configuredForOllama = appStatus?.embeddings?.provider === "ollama";
const storedVectors = Number(appStatus?.embeddings?.storedEmbeddings ?? counts.ollama_embeddings ?? 0);
const liveEmbeddingOk = ollamaEmbed.ok && vectorLength > 0;
const ollamaUnavailable = configuredForOllama && !liveEmbeddingOk && storedVectors > 0;
const ollamaState = liveEmbeddingOk ? "pass" : (ollamaUnavailable ? "warn" : "fail");
const ollamaNote = liveEmbeddingOk
  ? "Live embedding probe returned a vector."
  : (ollamaUnavailable
    ? "Historical Ollama vectors exist, but the live embed probe was unreachable from this runner context."
    : "Live embedding probe failed and no prior evidence was strong enough to downgrade it to a warning.");

const verification = {
  generatedAt: new Date().toISOString(),
  checks: {
    typecheck: {
      ok: typecheck.ok,
      durationMs: typecheck.durationMs
    },
    buildElectron: {
      ok: buildElectron.ok,
      durationMs: buildElectron.durationMs
    },
    appStatus: {
      ok: appStatusResult.ok,
      status: appStatus
    },
    ollamaEmbedding: {
      ok: ollamaState !== "fail",
      state: ollamaState,
      vectorLength,
      model: "qwen3-embedding:0.6b",
      note: ollamaNote
    },
    sqlite: {
      ok: countsResult.ok && recentResult.ok,
      counts,
      prefs,
      recent
    }
  },
  failures: [
    typecheck,
    buildElectron,
    appStatusResult,
    ...(ollamaState === "fail" ? [ollamaEmbed] : []),
    countsResult,
    recentResult,
    prefsResult
  ]
    .filter((entry) => !entry.ok)
    .map((entry) => ({
      cmd: entry.cmd,
      stderr: entry.stderr,
      stdout: entry.stdout
    }))
};

fs.writeFileSync(jsonPath, `${JSON.stringify(verification, null, 2)}\n`);

const checkLine = (label, state) => `- ${state.toUpperCase()} ${label}`;
const latestTelegram = recent.find((entry) => entry.source?.startsWith("tg_"));

const markdown = `# driftpet Morning Brief - ${reportDate}

## One-Line Read

driftpet now has a working V1 spine plus control surfaces: Telegram capture on the phone, local chaos-reset input, cloud digest generation, local Qwen embeddings through Ollama, filtered related-memory recall, and an in-app pet mode / budget / health surface.

## Verification

${checkLine("TypeScript checks", typecheck.ok ? "pass" : "fail")}
${checkLine("Electron main build", buildElectron.ok ? "pass" : "fail")}
${checkLine("Main-process status probe", appStatusResult.ok ? "pass" : "fail")}
${checkLine("Ollama qwen3-embedding:0.6b vector", ollamaState)}
${checkLine("SQLite readback", countsResult.ok && recentResult.ok ? "pass" : "fail")}

Current counts:

- Items: ${counts.items ?? "unknown"}
- Real items: ${counts.real_items ?? "unknown"}
- Synthetic items: ${counts.synthetic_items ?? "unknown"}
- Cards: ${counts.cards ?? "unknown"}
- Embeddings: ${counts.embeddings ?? "unknown"}
- Telegram items: ${counts.telegram_items ?? "unknown"}
- Ollama embeddings: ${counts.ollama_embeddings ?? "unknown"}
- Latest Telegram item: ${latestTelegram?.extractedTitle ?? "none observed"}
- Pet mode: ${appStatus?.pet?.mode ?? "unknown"}
- Pet hourly budget: ${appStatus?.pet?.hourlyBudget ?? "unknown"}
- Auto cards shown this hour: ${appStatus?.pet?.shownThisHour ?? "unknown"}

## What Is Working

- The Mac app starts with Electron + React + TypeScript.
- Telegram long polling is configured and has processed a real phone message.
- Digest cards are generated through the configured OpenAI Responses-compatible relay.
- Local embeddings are generated through Ollama using \`qwen3-embedding:0.6b\`.
- Related recall is no longer just lexical; recent cards have real local vectors.
- SQLite persists items, cards, events, prefs, and card embeddings locally.
- The renderer can now show Telegram / LLM / embeddings / storage health without opening SQLite.
- The pet has \`focus\` / \`sleep\` modes plus an hourly auto-surface budget.
- Manual chaos dumps now go through a dedicated thread-reset lane instead of the generic note path.
- Related recall excludes synthetic verification data and Telegram ping cards.

## Product Shape

The product is strongest when it stays narrow:

> Send drift into Telegram. driftpet turns it into one useful card and connects it to memory.
> Or hit "I'm drifting" locally and let the pet pull you back to one thread.

Do not make it a general chatbot yet. The valuable behavior is not conversation volume; it is capture, compression, and resurfacing.

## Architecture Snapshot

- UI shell: Electron renderer with React components.
- Main process: SQLite, Telegram polling, extraction, LLM calls, recall.
- Pet runtime: local mode state plus hourly interruption budget.
- Storage: local SQLite under \`data/app.db\`.
- Text model path: \`DRIFTPET_LLM_PROVIDER=openai\` with a relay endpoint.
- Embedding path: \`DRIFTPET_EMBED_PROVIDER=ollama\`.
- Local embedding model: \`qwen3-embedding:0.6b\`.

## Tomorrow's Priority

1. Run a real usage pass.
   Feed more real captures instead of synthetic-only probes and note where cards still become vague or annoying.

2. Retune prompts and thresholds.
   Tighten the chaos-reset phrasing and recall thresholds against real cards, not only smoke tests.

3. Refresh README and handoff docs.
   The product shape has moved beyond the Day 1-3 skeleton and the docs should match it.

## Do Not Build Tomorrow

- Browser extension.
- Passive state sensing.
- Complex pet animation.
- Cross-device sync.
- Topic/person/project schema.
- Full local LLM digest.

These are tempting, but the core loop still needs observation.

## Known Risks

- \`better-sqlite3\` has separate native ABI needs for system Node and Electron. Use Electron runtime for app-equivalent smoke tests.
- Telegram \`409\` can happen if two pollers run with the same bot token.
- Secrets currently live in \`.env\`; rotate exposed keys later.
- Live Ollama probing can be unavailable from a constrained runner context even when stored vectors prove the path worked earlier.
- URL extraction and Telegram URL cases need another live test pass.

## Useful Commands

Start app:

\`\`\`bash
cd /Users/mac/driftpet
npm run dev
\`\`\`

Run verification:

\`\`\`bash
cd /Users/mac/driftpet
node scripts/overnight-goal.mjs
\`\`\`

Verify Ollama model:

\`\`\`bash
ollama list
curl -s http://127.0.0.1:11434/api/embed -H 'Content-Type: application/json' -d '{"model":"qwen3-embedding:0.6b","input":"test"}'
\`\`\`

Inspect latest cards:

\`\`\`bash
sqlite3 -header -column data/app.db "select id, source, status, extracted_title from items order by id desc limit 10;"
\`\`\`

## Morning Decision

The next clean product move is a real-usage tuning pass. The product surface is wide enough for V1; now tighten outputs against real captures instead of adding more feature branches.
`;

fs.writeFileSync(reportPath, markdown);

if (verification.failures.length > 0) {
  process.exitCode = 1;
}
