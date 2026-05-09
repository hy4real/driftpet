#!/usr/bin/env node

import fs from "node:fs/promises"

const REQUIRED_TRAILERS = [
  "Confidence",
  "Scope-risk",
  "Tested",
]

export function parseLoreCommitMessage(text) {
  const normalized = text.replace(/\r\n/g, "\n").trimEnd()
  const lines = normalized.split("\n")
  const subject = lines[0]?.trim() ?? ""
  const blankLineIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "")
  const trailerLines = blankLineIndex === -1 ? [] : lines.slice(blankLineIndex + 1).filter((line) => line.trim().length > 0)

  const trailers = new Map()
  for (const line of trailerLines) {
    const match = /^([A-Za-z][A-Za-z-]*):\s+(.+)$/.exec(line)
    if (!match) continue
    trailers.set(match[1], match[2])
  }

  return {
    subject,
    lines,
    trailers,
    hasBlankLineAfterSubject: lines.length === 1 || (lines[1] ?? "").trim() === "",
  }
}

export function validateLoreCommitMessage(text) {
  const parsed = parseLoreCommitMessage(text)
  const reasons = []

  if (!parsed.subject) {
    reasons.push("missing intent line")
  }

  if (!parsed.hasBlankLineAfterSubject) {
    reasons.push("commit message must have a blank line after the intent line")
  }

  for (const trailer of REQUIRED_TRAILERS) {
    if (!parsed.trailers.has(trailer)) {
      reasons.push(`missing required trailer: ${trailer}`)
    }
  }

  const confidence = parsed.trailers.get("Confidence")
  if (confidence && !["low", "medium", "high"].includes(confidence)) {
    reasons.push("Confidence must be one of: low, medium, high")
  }

  const scopeRisk = parsed.trailers.get("Scope-risk")
  if (scopeRisk && !["narrow", "moderate", "broad"].includes(scopeRisk)) {
    reasons.push("Scope-risk must be one of: narrow, moderate, broad")
  }

  return {
    ok: reasons.length === 0,
    reasons,
  }
}

async function main() {
  const file = process.argv[2]
  if (!file) {
    throw new Error("usage: node scripts/validate-lore-commit.mjs .git/COMMIT_EDITMSG")
  }

  const text = await fs.readFile(file, "utf8")
  const result = validateLoreCommitMessage(text)
  console.log(JSON.stringify(result, null, 2))

  if (!result.ok) {
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main()
}
