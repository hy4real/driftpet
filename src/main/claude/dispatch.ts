import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { CardRecord } from "../types/card";
import type { RememberedThread } from "../types/status";
import type { ClaudeDispatchMeta, ClaudeDispatchMode, ClaudeDispatchStatus } from "../types/claude";
import type { ThreadBundle } from "../types/thread";
import { getDataDir } from "../paths";
import { getClaudeDispatchSettings, type ClaudeDispatchSettings } from "./settings";

export type ClaudeDispatchPayload = {
  card: CardRecord;
  rememberedThread: RememberedThread | null;
  recentCards: CardRecord[];
  threadBundle?: ThreadBundle | null;
  mode?: ClaudeDispatchMode;
};

export type ClaudeDispatchResult = ClaudeDispatchMeta;

export const getClaudeDispatchPrefKey = (cardId: number): string => {
  return `claude_dispatch_card_${cardId}`;
};

export const normalizeClaudeDispatchStatus = (value: unknown): ClaudeDispatchStatus => {
  if (value === "failed" || value === "done" || value === "dismissed") {
    return value;
  }

  return "launched";
};

export const parseClaudeDispatchMeta = (raw: string | null): ClaudeDispatchMeta | null => {
  if (raw === null || raw.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      command?: unknown;
      promptPath?: unknown;
      runner?: unknown;
      cwd?: unknown;
      createdAt?: unknown;
      status?: unknown;
      mode?: unknown;
      error?: unknown;
      resultSummary?: unknown;
      resultCapturedAt?: unknown;
    };
    if (
      typeof parsed.command !== "string"
      || typeof parsed.promptPath !== "string"
      || typeof parsed.runner !== "string"
      || typeof parsed.cwd !== "string"
    ) {
      return null;
    }

    return {
      command: parsed.command,
      promptPath: parsed.promptPath,
      runner: parsed.runner,
      cwd: parsed.cwd,
      createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : 0,
      status: normalizeClaudeDispatchStatus(parsed.status),
      mode: parsed.mode === "thread" ? "thread" : "card",
      error: typeof parsed.error === "string" ? parsed.error : undefined,
      resultSummary: typeof parsed.resultSummary === "string" && parsed.resultSummary.trim().length > 0
        ? parsed.resultSummary
        : undefined,
      resultCapturedAt: typeof parsed.resultCapturedAt === "number" ? parsed.resultCapturedAt : undefined,
    };
  } catch {
    return null;
  }
};

const formatPriorClaudeResults = (cards: CardRecord[]): string[] => {
  const seen = new Set<number>();
  const resultLines: string[] = [];

  for (const entry of cards) {
    if (seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);

    const summary = entry.latestClaudeDispatch?.resultSummary?.trim();
    if (summary === undefined || summary.length === 0) {
      continue;
    }

    resultLines.push(`- ${entry.title}: ${summary}`);
  }

  return resultLines.slice(0, 5);
};

const DEFAULT_CLAUDE_BIN = process.env.DRIFTPET_CLAUDE_CODE_BIN?.trim() || "claude";

const shellQuote = (value: string): string => {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
};

const appleScriptQuote = (value: string): string => {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
};

export const buildClaudeCodePrompt = ({
  card,
  rememberedThread,
  recentCards,
  threadBundle,
  mode = "card",
}: ClaudeDispatchPayload): string => {
  const siblingCards = recentCards
    .filter((entry) => entry.id !== card.id)
    .slice(0, 3);
  const threadCards = threadBundle?.cards.filter((entry) => entry.card.id !== card.id) ?? [];
  const priorClaudeResults = formatPriorClaudeResults([
    card,
    ...threadCards.map((entry) => entry.card),
    ...siblingCards,
  ]);

  return [
    "# driftpet -> Claude Code task",
    "",
    "You are receiving a task packet from driftpet.",
    "Work from the current repository. Stay focused on the immediate task before widening scope.",
    "",
    "## Dispatch mode",
    mode === "thread"
      ? "Thread mode: treat the current card as part of one continuing line of work. Preserve continuity unless repo evidence says the line should split."
      : "Card mode: solve the current card directly without assuming a broader thread beyond the supplied context.",
    "",
    "## Current card",
    `Title: ${card.title}`,
    `Next step: ${card.useFor}`,
    `Knowledge tag: ${card.knowledgeTag}`,
    `Pet remark: ${card.petRemark}`,
    "",
    ...(mode === "thread" && threadBundle !== null && threadBundle !== undefined
      ? [
        "## Active thread bundle",
        `Anchor: ${threadBundle.anchorTitle}`,
        ...threadBundle.cards.map((entry, index) => `${index + 1}. ${entry.card.title} | ${entry.card.useFor} | ${entry.reason}`),
        "",
      ]
      : []),
    ...(rememberedThread === null
      ? []
      : [
        "## Remembered thread",
        `${rememberedThread.title}`,
        "",
      ]),
    ...(card.related.length === 0
      ? []
      : [
        "## Related recall",
        ...card.related.map((related, index) => `${index + 1}. ${related.title} — ${related.reason}`),
        "",
      ]),
    ...(siblingCards.length === 0
      ? []
      : [
        "## Recent sibling cards",
        ...siblingCards.map((entry, index) => `${index + 1}. ${entry.title} | ${entry.useFor}`),
        "",
      ]),
    ...(priorClaudeResults.length === 0
      ? []
      : [
        "## Prior Claude dispatch results",
        ...priorClaudeResults,
        "",
      ]),
    ...(mode === "thread" && threadCards.length > 0
      ? [
        "## Thread handling",
        "Use the active thread bundle first when deciding scope and sequencing.",
        "Pull in sibling cards only when the thread bundle is insufficient.",
        "",
      ]
      : []),
    "## Task",
    "1. Read the repository state relevant to this card.",
    "2. Decide the smallest concrete implementation or investigation that satisfies the card's next step.",
    "3. Execute it in the repo.",
    "4. Verify the result with the narrowest useful checks.",
    "5. Report what changed, what was verified, and any residual risk.",
    "",
    "Do not turn this into a broader redesign unless the repository evidence makes that unavoidable.",
  ].join("\n");
};

export const buildClaudeLaunchCommand = (
  promptPath: string,
  settings: ClaudeDispatchSettings = getClaudeDispatchSettings()
): { command: string; runner: string } => {
  const quotedPromptPath = shellQuote(promptPath);
  const workingDirectory = settings.workingDirectory;
  const quotedWorkingDirectory = shellQuote(workingDirectory);

  return {
    runner: DEFAULT_CLAUDE_BIN,
    command: `cd ${quotedWorkingDirectory} && cat ${quotedPromptPath} | ${shellQuote(DEFAULT_CLAUDE_BIN)} --add-dir ${quotedWorkingDirectory}`,
  };
};

export const buildTerminalLaunch = (command: string, terminalApp: string): { program: string; args: string[] } => {
  const normalized = terminalApp.trim().toLowerCase();

  if (normalized === "ghostty") {
    return {
      program: "open",
      args: [
        "-na",
        "Ghostty.app",
        "--args",
        "-e",
        "/bin/zsh",
        "-lc",
        command,
      ],
    };
  }

  if (normalized === "iterm") {
    return {
      program: "osascript",
      args: [
        "-e",
        `tell application "iTerm" to create window with default profile command "${appleScriptQuote(command)}"`,
      ],
    };
  }

  return {
    program: "osascript",
    args: [
      "-e",
      `tell application "${appleScriptQuote(terminalApp)}" to do script "${appleScriptQuote(command)}"`,
    ],
  };
};

export const launchClaudeCodeTask = async (payload: ClaudeDispatchPayload): Promise<ClaudeDispatchResult> => {
  const dispatchDir = path.join(getDataDir(), "claude-dispatches");
  fs.mkdirSync(dispatchDir, { recursive: true });

  const promptPath = path.join(
    dispatchDir,
    `card-${payload.card.id}-${Date.now()}.md`
  );
  fs.writeFileSync(promptPath, buildClaudeCodePrompt(payload), "utf8");

  const settings = getClaudeDispatchSettings();
  const launch = buildClaudeLaunchCommand(promptPath, settings);

  if (process.platform !== "darwin") {
    throw new Error("Claude Code dispatch currently expects macOS Terminal automation.");
  }

  const terminalLaunch = buildTerminalLaunch(launch.command, settings.terminalApp);
  await runTerminalLaunch(terminalLaunch.program, terminalLaunch.args);

  return {
    command: launch.command,
    promptPath,
    runner: launch.runner,
    cwd: settings.workingDirectory,
    createdAt: Date.now(),
    status: "launched",
    mode: payload.mode ?? "card",
  };
};

const runOsaScript = async (script: string): Promise<void> => {
  await runTerminalLaunch("osascript", ["-e", script]);
};

const runTerminalLaunch = async (program: string, args: string[]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(program, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `${program} exited with code ${code ?? 1}`));
    });
  });
};
