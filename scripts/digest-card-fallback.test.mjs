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
    assert.match(result.digest.useFor, /Next: Close two unrelated tabs, write the first checklist line/);
    assert.doesNotMatch(result.digest.useFor, /smallest deliverable/i);
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
