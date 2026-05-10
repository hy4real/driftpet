import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const localTempRoot = path.resolve(".tmp");
const dispatchEntry = path.resolve("src/main/claude/dispatch.ts");

const buildDispatchModule = async () => {
  await fs.mkdir(localTempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(localTempRoot, "driftpet-claude-dispatch-"));
  const outfile = path.join(tempDir, "dispatch.cjs");

  await build({
    entryPoints: [dispatchEntry],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile,
    loader: {
      ".ts": "ts",
    },
    external: ["better-sqlite3", "electron"],
  });

  const moduleExports = require(outfile);
  return {
    buildClaudeCodePrompt: moduleExports.buildClaudeCodePrompt,
    buildClaudeLaunchCommand: moduleExports.buildClaudeLaunchCommand,
    buildTerminalLaunch: moduleExports.buildTerminalLaunch,
    parseClaudeDispatchMeta: moduleExports.parseClaudeDispatchMeta,
    cleanupBundle: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
};

test("buildClaudeLaunchCommand pipes the prompt file into claude stdin", async () => {
  const { buildClaudeLaunchCommand, cleanupBundle } = await buildDispatchModule();

  try {
    const result = buildClaudeLaunchCommand("/tmp/driftpet-card.md", {
      terminalApp: "Ghostty",
      workingDirectory: "/tmp/driftpet-worktree",
    });

    assert.match(result.command, /cat '\/tmp\/driftpet-card\.md' \|/);
    assert.match(result.command, /cd '\/tmp\/driftpet-worktree' &&/);
    assert.match(result.command, /claude' --add-dir '\/tmp\/driftpet-worktree'/);
    assert.doesNotMatch(result.command, /\$\(cat /);
    assert.equal(result.runner, "claude");
  } finally {
    await cleanupBundle();
  }
});

test("buildTerminalLaunch uses open --args for Ghostty on macOS", async () => {
  const { buildTerminalLaunch, cleanupBundle } = await buildDispatchModule();

  try {
    const result = buildTerminalLaunch("echo hi", "Ghostty");

    assert.equal(result.program, "open");
    assert.deepEqual(result.args, [
      "-na",
      "Ghostty.app",
      "--args",
      "-e",
      "/bin/zsh",
      "-lc",
      "echo hi",
    ]);
  } finally {
    await cleanupBundle();
  }
});

test("parseClaudeDispatchMeta preserves known statuses and backfills legacy launched records", async () => {
  const { parseClaudeDispatchMeta, cleanupBundle } = await buildDispatchModule();

  try {
    assert.deepEqual(parseClaudeDispatchMeta(JSON.stringify({
      command: "cmd",
      promptPath: "/tmp/prompt.md",
      runner: "claude",
      cwd: "/repo",
    })), {
      command: "cmd",
      promptPath: "/tmp/prompt.md",
      runner: "claude",
      cwd: "/repo",
      createdAt: 0,
      status: "launched",
      mode: "card",
      error: undefined,
    });

    assert.deepEqual(parseClaudeDispatchMeta(JSON.stringify({
      command: "",
      promptPath: "",
      runner: "",
      cwd: "/repo",
      createdAt: 1778320000000,
      status: "failed",
      error: "Terminal automation denied",
    })), {
      command: "",
      promptPath: "",
      runner: "",
      cwd: "/repo",
      createdAt: 1778320000000,
      status: "failed",
      mode: "card",
      error: "Terminal automation denied",
    });

    assert.deepEqual(parseClaudeDispatchMeta(JSON.stringify({
      command: "cmd",
      promptPath: "/tmp/prompt.md",
      runner: "claude",
      cwd: "/repo",
      createdAt: 1778320000001,
      status: "done",
      mode: "thread",
    })), {
      command: "cmd",
      promptPath: "/tmp/prompt.md",
      runner: "claude",
      cwd: "/repo",
      createdAt: 1778320000001,
      status: "done",
      mode: "thread",
      error: undefined,
    });

    assert.deepEqual(parseClaudeDispatchMeta(JSON.stringify({
      command: "cmd",
      promptPath: "/tmp/prompt.md",
      runner: "claude",
      cwd: "/repo",
      createdAt: 1778320000002,
      status: "dismissed",
      mode: "card",
    })), {
      command: "cmd",
      promptPath: "/tmp/prompt.md",
      runner: "claude",
      cwd: "/repo",
      createdAt: 1778320000002,
      status: "dismissed",
      mode: "card",
      error: undefined,
    });

    assert.deepEqual(parseClaudeDispatchMeta(JSON.stringify({
      command: "cmd",
      promptPath: "/tmp/prompt.md",
      runner: "claude",
      cwd: "/repo",
      status: "unknown",
    })).status, "launched");

    assert.equal(parseClaudeDispatchMeta("{broken"), null);
  } finally {
    await cleanupBundle();
  }
});

test("buildClaudeCodePrompt includes active thread bundle in thread mode", async () => {
  const { buildClaudeCodePrompt, cleanupBundle } = await buildDispatchModule();

  try {
    const prompt = buildClaudeCodePrompt({
      card: {
        id: 17,
        itemId: 9,
        title: "Ship thread mode",
        useFor: "Show continuity first.",
        knowledgeTag: "thread mode",
        summaryForRetrieval: "ship thread mode show continuity first",
        related: [],
        petRemark: "Anchor card",
        createdAt: Date.now(),
      },
      rememberedThread: {
        cardId: 17,
        title: "Ship thread mode",
        createdAt: Date.now(),
      },
      recentCards: [],
      mode: "thread",
      threadBundle: {
        anchorCardId: 17,
        anchorTitle: "Ship thread mode",
        anchorKnowledgeTag: "thread mode",
        cards: [
          {
            reason: "anchor",
            card: {
              id: 17,
              itemId: 9,
              title: "Ship thread mode",
              useFor: "Show continuity first.",
              knowledgeTag: "thread mode",
              summaryForRetrieval: "ship thread mode show continuity first",
              related: [],
              petRemark: "Anchor card",
              createdAt: Date.now(),
            },
          },
          {
            reason: "related",
            card: {
              id: 18,
              itemId: 10,
              title: "Reuse related cards",
              useFor: "Stay inside current surfaces.",
              knowledgeTag: "thread mode",
              summaryForRetrieval: "reuse related cards and current surfaces",
              related: [],
              petRemark: "Related card",
              createdAt: Date.now(),
            },
          },
        ],
      },
    });

    assert.match(prompt, /## Dispatch mode/);
    assert.match(prompt, /Thread mode:/);
    assert.match(prompt, /## Active thread bundle/);
    assert.match(prompt, /Reuse related cards/);
  } finally {
    await cleanupBundle();
  }
});
