import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const localTempRoot = path.resolve(".tmp");
const digestEntry = path.resolve("src/main/llm/digest-card.ts");
const fixturePath = path.resolve("scripts/fixtures/digest-card-llm-replay.json");

const llmClientStubPlugin = {
  name: "llm-client-stub",
  setup(builder) {
    builder.onResolve({ filter: /^\.\/client$/ }, (args) => {
      if (args.importer.endsWith(path.normalize("src/main/llm/digest-card.ts"))) {
        return {
          path: "llm-client-stub",
          namespace: "llm-client-stub",
        };
      }

      return null;
    });

    builder.onLoad({ filter: /.*/, namespace: "llm-client-stub" }, () => ({
      loader: "js",
      contents: `
        export const canUseLlm = () => true;
        export const getLlmMissingReason = () => "";
        export const sendTextPrompt = async (args) => {
          const calls = globalThis.__DRIFTPET_LLM_STUB_CALLS__ ?? [];
          calls.push(args);
          globalThis.__DRIFTPET_LLM_STUB_CALLS__ = calls;

          const queue = globalThis.__DRIFTPET_LLM_STUB_RESPONSES__;
          if (!Array.isArray(queue) || queue.length === 0) {
            throw new Error("No stub LLM response queued.");
          }

          const response = queue.shift();
          if (response instanceof Error) {
            throw response;
          }

          if (typeof response === "function") {
            return response(args);
          }

          return typeof response === "string" ? response : JSON.stringify(response);
        };
      `,
    }));
  },
};

const buildDigestModule = async () => {
  await fs.mkdir(localTempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(localTempRoot, "driftpet-digest-card-llm-"));
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
    plugins: [llmClientStubPlugin],
  });

  const moduleExports = require(outfile);
  return {
    generateDigestDraft: moduleExports.generateDigestDraft,
    cleanupBundle: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
};

const withMockLlmDigest = async (responses, callback) => {
  const { generateDigestDraft, cleanupBundle } = await buildDigestModule();
  globalThis.__DRIFTPET_LLM_STUB_RESPONSES__ = [...responses];
  globalThis.__DRIFTPET_LLM_STUB_CALLS__ = [];

  try {
    return await callback(generateDigestDraft, globalThis.__DRIFTPET_LLM_STUB_CALLS__);
  } finally {
    delete globalThis.__DRIFTPET_LLM_STUB_RESPONSES__;
    delete globalThis.__DRIFTPET_LLM_STUB_CALLS__;
    await cleanupBundle();
  }
};

const readReplayCases = async () => {
  const raw = await fs.readFile(fixturePath, "utf8");
  return JSON.parse(raw);
};

const toPattern = (value) => new RegExp(value, "u");

const assertPattern = (actual, expected, label) => {
  if (typeof expected !== "string") {
    return;
  }

  assert.match(actual ?? "", toPattern(expected), label);
};

const assertNotPattern = (actual, expected, label) => {
  if (typeof expected !== "string") {
    return;
  }

  assert.doesNotMatch(actual ?? "", toPattern(expected), label);
};

const assertReplayExpectation = (result, expected) => {
  if (Object.hasOwn(expected, "digestError")) {
    assert.equal(result.digestError, expected.digestError);
  }

  assertPattern(result.digest.title, expected.titleMatches, "title should match replay expectation");
  assertNotPattern(result.digest.title, expected.titleNotMatches, "title should avoid generic replay text");
  assertPattern(result.digest.knowledgeTag, expected.knowledgeTagMatches, "knowledgeTag should match replay expectation");
  assertNotPattern(result.digest.knowledgeTag, expected.knowledgeTagNotMatches, "knowledgeTag should avoid generic replay text");
  assertPattern(result.digest.useFor, expected.useForMatches, "useFor should match replay expectation");
  assertNotPattern(result.digest.useFor, expected.useForNotMatches, "useFor should avoid generic replay text");
  assert.notEqual(result.digest.threadCache, null);
  assertPattern(result.digest.threadCache.nextMove, expected.nextMoveMatches, "nextMove should match replay expectation");
  assertNotPattern(result.digest.threadCache.nextMove, expected.nextMoveNotMatches, "nextMove should avoid generic replay text");
  assertPattern(result.digest.threadCache.ruledOut ?? "", expected.ruledOutMatches, "ruledOut should match replay expectation");
  assertPattern(result.digest.threadCache.sideThread ?? "", expected.sideThreadMatches, "sideThread should match replay expectation");
};

const replayCases = await readReplayCases();

for (const replayCase of replayCases) {
  test(`LLM replay: ${replayCase.name}`, async () => {
    await withMockLlmDigest(
      replayCase.responses,
      async (generateDigestDraft, calls) => {
        const result = await generateDigestDraft(replayCase.input, []);

        assert.equal(calls.length, replayCase.responses.length);
        assertReplayExpectation(result, replayCase.expect);
      }
    );
  });
}
