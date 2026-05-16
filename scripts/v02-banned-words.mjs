import fs from "node:fs/promises";
import path from "node:path";

export const V02_BANNED_WORDS = Object.freeze([
  "待处理",
  "未完成",
  "清理",
  "过期",
  "删除",
]);

export const V02_FIRST_CLASS_UI_FILES = Object.freeze([
  "src/renderer/App.tsx",
  "src/renderer/components/PetShell.tsx",
  "src/renderer/components/PetWorkbench.tsx",
  "src/renderer/components/ResumeThreadCard.tsx",
  "src/renderer/components/CompactThreadCard.tsx",
  "src/renderer/components/HistoryDrawer.tsx",
  "src/renderer/thread-cache-waiting.ts",
  "src/renderer/waiting-reminder-cadence.ts",
  "src/renderer/rank-history.ts",
  "src/renderer/ui-surface.ts",
]);

export const EXCEPTION_MARKER = "v02-copy:allow-banned";

/**
 * @typedef {{ file: string, line: number, word: string, text: string }} BannedHit
 */

/**
 * Scan files for v0.2 banned wording. A line is exempted only when the
 * matching line itself, or the line immediately above it, contains the
 * EXCEPTION_MARKER substring. This keeps every exception visible at the
 * call site and requires an explicit reviewer marker.
 *
 * @param {ReadonlyArray<string>} files - paths to scan (relative to repoRoot, or absolute)
 * @param {ReadonlyArray<string>} [bannedWords]
 * @param {string} [repoRoot]
 * @returns {Promise<BannedHit[]>}
 */
export const scanForBannedWords = async (
  files,
  bannedWords = V02_BANNED_WORDS,
  repoRoot = process.cwd()
) => {
  const hits = [];

  for (const relPath of files) {
    const fullPath = path.resolve(repoRoot, relPath);
    const source = await fs.readFile(fullPath, "utf8");
    const lines = source.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const previousLine = i > 0 ? lines[i - 1] : "";
      const isExempted = line.includes(EXCEPTION_MARKER) || previousLine.includes(EXCEPTION_MARKER);
      if (isExempted) {
        continue;
      }

      for (const word of bannedWords) {
        if (line.includes(word)) {
          hits.push({
            file: relPath,
            line: i + 1,
            word,
            text: line.trim(),
          });
        }
      }
    }
  }

  return hits;
};

/**
 * @param {ReadonlyArray<BannedHit>} hits
 * @returns {string}
 */
export const formatBannedHits = (hits) => {
  return hits
    .map((hit) => `  ${hit.file}:${hit.line}  「${hit.word}」  ${hit.text}`)
    .join("\n");
};
