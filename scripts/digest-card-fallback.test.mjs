import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const localTempRoot = path.resolve(".tmp");
const digestEntry = path.resolve("src/main/llm/digest-card.ts");

const buildDigestModule = async () => {
  await fs.mkdir(localTempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(localTempRoot, "driftpet-digest-card-"));
  const outfile = path.join(tempDir, "digest-card.cjs");

  await build({
    entryPoints: [digestEntry],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile,
    loader: {
      ".ts": "ts",
    },
    external: ["better-sqlite3"],
  });

  const moduleExports = require(outfile);
  return {
    generateDigestDraft: moduleExports.generateDigestDraft,
    cleanupBundle: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
};

const LLM_ENV_KEYS = [
  "DRIFTPET_LLM_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
];

test("manual chaos fallback uses a concrete first action instead of meta deliverable wording", async () => {
  const { generateDigestDraft, cleanupBundle } = await buildDigestModule();
  const previousEnv = new Map(LLM_ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of LLM_ENV_KEYS) {
    delete process.env[key];
  }

  try {
    const result = await generateDigestDraft(
      {
        source: "manual_chaos",
        rawText: "Need to finish the launch checklist, but I keep drifting into CSS polish, extra tabs, and unrelated refactor notes.",
      },
      []
    );

    assert.match(result.digest.useFor, /^Set aside: /);
    assert.match(result.digest.useFor, /Next: Close two unrelated tabs, let driftpet guard/);
    assert.doesNotMatch(result.digest.useFor, /smallest deliverable/i);
    assert.match(result.digest.knowledgeTag, /thread cache/i);
    assert.match(result.digest.summaryForRetrieval, /Working-memory cache/);
    assert.equal(result.digest.threadCache.chasing, "Need to finish the launch checklist");
    assert.match(result.digest.threadCache.nextMove, /Close two unrelated tabs/);
    assert.match(result.digest.threadCache.sideThread ?? "", /extra links|anything that does not move|working-memory thread/i);
  } finally {
    await cleanupBundle();
    for (const [key, value] of previousEnv.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("telegram drift fallback turns tab spiral into a concrete reset action", async () => {
  const { generateDigestDraft, cleanupBundle } = await buildDigestModule();
  const previousEnv = new Map(LLM_ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of LLM_ENV_KEYS) {
    delete process.env[key];
  }

  try {
    const result = await generateDigestDraft(
      {
        source: "tg_text",
        rawText: "I am spiraling into tabs again",
      },
      []
    );

    assert.equal(result.digest.title, "Tab drift reset");
    assert.notEqual(result.digest.knowledgeTag.toLowerCase(), "captured note");
    assert.match(result.digest.useFor, /Close two unrelated tabs/);
    assert.match(result.digest.useFor, /let driftpet guard/);
    assert.match(result.digest.useFor, /work on it for five minutes now/);
    assert.doesNotMatch(result.digest.useFor, /Turn this into one next action/i);
    assert.equal(result.digest.threadCache.chasing, "Tab drift reset");
    assert.match(result.digest.threadCache.nextMove, /Close two unrelated tabs/);
  } finally {
    await cleanupBundle();
    for (const [key, value] of previousEnv.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("manual chaos fallback names declared thread when recovering from tab drift", async () => {
  const { generateDigestDraft, cleanupBundle } = await buildDigestModule();
  const previousEnv = new Map(LLM_ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of LLM_ENV_KEYS) {
    delete process.env[key];
  }

  try {
    const result = await generateDigestDraft(
      {
        source: "manual_chaos",
        rawText: "I opened too many tabs and lost the thread. The next useful move is to pick one branch and close the rest.",
      },
      []
    );

    assert.match(result.digest.title, /pick one branch and close the rest/i);
    assert.match(result.digest.useFor, /^Set aside: /);
    assert.match(result.digest.useFor, /pick one branch and close the rest/i);
    assert.doesNotMatch(result.digest.useFor, /Close two unrelated tabs/);
    assert.doesNotMatch(result.digest.useFor, /Turn this into one next action/i);
    assert.match(result.digest.threadCache.chasing, /pick one branch and close the rest/i);
    assert.match(result.digest.threadCache.nextMove, /pick one branch and close the rest/i);
    assert.doesNotMatch(result.digest.threadCache.nextMove, /^to /i);
  } finally {
    await cleanupBundle();
    for (const [key, value] of previousEnv.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("manual chaos fallback preserves explicit next move in thread cache", async () => {
  const { generateDigestDraft, cleanupBundle } = await buildDigestModule();
  const previousEnv = new Map(LLM_ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of LLM_ENV_KEYS) {
    delete process.env[key];
  }

  try {
    const result = await generateDigestDraft(
      {
        source: "manual_chaos",
        rawText: "主线是验证 Thread Cache v1 是否真的守住工作记忆。我怀疑问题不是 URL extraction，而是 nextMove 太像摘要。别再扩展到桌面 app 识别，先跑三条真实样本，标出哪一格丢了。",
      },
      []
    );

    assert.match(result.digest.threadCache.chasing, /验证 Thread Cache v1/);
    assert.match(result.digest.threadCache.workingJudgment ?? "", /不是 URL extraction/);
    assert.match(result.digest.threadCache.ruledOut ?? "", /不是 URL extraction/);
    assert.match(result.digest.threadCache.nextMove, /跑三条真实样本/);
    assert.doesNotMatch(result.digest.threadCache.nextMove, /关掉两个无关标签页/);
  } finally {
    await cleanupBundle();
    for (const [key, value] of previousEnv.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("telegram text fallback frames high-signal notes as guarded working memory", async () => {
  const { generateDigestDraft, cleanupBundle } = await buildDigestModule();
  const previousEnv = new Map(LLM_ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of LLM_ENV_KEYS) {
    delete process.env[key];
  }

  try {
    const result = await generateDigestDraft(
      {
        source: "tg_text",
        rawText: "I suspect the issue is not URL extraction but recall dedupe around MDN locale variants. Next step is to run two locale URLs through the poller path.",
      },
      []
    );

    assert.match(result.digest.useFor, /Let driftpet guard/);
    assert.match(result.digest.summaryForRetrieval, /Working-memory cache/);
    assert.match(result.digest.summaryForRetrieval, /guarded thread/i);
    assert.doesNotMatch(result.digest.knowledgeTag.toLowerCase(), /captured note/);
    assert.match(result.digest.threadCache.workingJudgment ?? "", /not URL extraction/i);
    assert.match(result.digest.threadCache.ruledOut ?? "", /not URL extraction/i);
    assert.match(result.digest.threadCache.nextMove, /run two locale URLs/i);
  } finally {
    await cleanupBundle();
    for (const [key, value] of previousEnv.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("telegram text fallback keeps first-action clause over reference caveat", async () => {
  const { generateDigestDraft, cleanupBundle } = await buildDigestModule();
  const previousEnv = new Map(LLM_ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of LLM_ENV_KEYS) {
    delete process.env[key];
  }

  try {
    const result = await generateDigestDraft(
      {
        source: "tg_text",
        rawText: "Use the article only as reference. Tighten the current driftpet text card first, and do not expand into a broader redesign tonight.",
      },
      []
    );

    assert.match(result.digest.title, /Tighten the current driftpet text card/i);
    assert.equal(result.digest.knowledgeTag, "Tighten the current driftpet");
    assert.match(result.digest.threadCache.chasing, /Tighten the current driftpet text card/i);
    assert.equal(result.digest.threadCache.nextMove, "Tighten the current driftpet text card");
    assert.doesNotMatch(result.digest.threadCache.nextMove, /^,/);
    assert.doesNotMatch(result.digest.threadCache.nextMove, /broader redesign/i);
  } finally {
    await cleanupBundle();
    for (const [key, value] of previousEnv.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
