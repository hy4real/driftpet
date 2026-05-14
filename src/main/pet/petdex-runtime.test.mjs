import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const repoRoot = process.cwd();
const { parsePetdexRuntimeBubble, parsePetdexRuntimeState } = await import(
  path.join(repoRoot, "dist-electron/src/main/pet/petdex-runtime.js")
);

test("parsePetdexRuntimeState accepts petdex hook state shape", () => {
  assert.deepEqual(
    parsePetdexRuntimeState(JSON.stringify({
      state: "running",
      duration: null,
      updatedAt: 1778559905063,
      counter: 4,
      agent_source: "codex",
    })),
    {
      expression: "running",
      durationMs: null,
      updatedAt: 1778559905063,
      counter: 4,
      agentSource: "codex",
    }
  );
});

test("parsePetdexRuntimeState normalizes directional running and invalid fields", () => {
  assert.deepEqual(
    parsePetdexRuntimeState(JSON.stringify({
      state: "running-left",
      duration: 1500.3,
      updatedAt: "bad",
      counter: "bad",
      agent_source: null,
    })),
    {
      expression: "running",
      durationMs: 1500,
      updatedAt: null,
      counter: null,
      agentSource: null,
    }
  );
});

test("parsePetdexRuntimeState returns null for invalid JSON", () => {
  assert.equal(parsePetdexRuntimeState("not json"), null);
});

test("parsePetdexRuntimeBubble accepts petdex bubble shape", () => {
  assert.deepEqual(
    parsePetdexRuntimeBubble(JSON.stringify({
      text: "Running tool",
      agent_source: "codex",
      updatedAt: 1778559905063,
      counter: 8,
    })),
    {
      text: "Running tool",
      agentSource: "codex",
      updatedAt: 1778559905063,
      counter: 8,
    }
  );
});

test("parsePetdexRuntimeBubble tolerates empty or invalid fields", () => {
  assert.deepEqual(
    parsePetdexRuntimeBubble(JSON.stringify({
      text: null,
      agent_source: null,
      updatedAt: "bad",
      counter: "bad",
    })),
    {
      text: "",
      agentSource: null,
      updatedAt: null,
      counter: null,
    }
  );
});
