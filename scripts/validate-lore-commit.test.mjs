import test from "node:test"
import assert from "node:assert/strict"

import { parseLoreCommitMessage, validateLoreCommitMessage } from "./validate-lore-commit.mjs"

const validMessage = `Prevent workflow drift from bypassing local checks

The repo now enforces workflow health before commit and validates
Lore trailers for commit hygiene.

Confidence: high
Scope-risk: narrow
Tested: npm run workflow:check
`

test("parseLoreCommitMessage extracts subject and trailers", () => {
  const parsed = parseLoreCommitMessage(validMessage)

  assert.equal(parsed.subject, "Prevent workflow drift from bypassing local checks")
  assert.equal(parsed.trailers.get("Confidence"), "high")
  assert.equal(parsed.trailers.get("Scope-risk"), "narrow")
  assert.equal(parsed.trailers.get("Tested"), "npm run workflow:check")
})

test("validateLoreCommitMessage accepts valid lore commit message", () => {
  const result = validateLoreCommitMessage(validMessage)
  assert.equal(result.ok, true)
  assert.deepEqual(result.reasons, [])
})

test("validateLoreCommitMessage rejects missing trailers", () => {
  const result = validateLoreCommitMessage(`Ship the thing\n\nBody only\n`)
  assert.equal(result.ok, false)
  assert.match(result.reasons.join("\n"), /missing required trailer: Confidence/)
  assert.match(result.reasons.join("\n"), /missing required trailer: Scope-risk/)
  assert.match(result.reasons.join("\n"), /missing required trailer: Tested/)
})

test("validateLoreCommitMessage rejects invalid trailer values", () => {
  const result = validateLoreCommitMessage(`Do something

Body

Confidence: certain
Scope-risk: tiny
Tested: none
`)

  assert.equal(result.ok, false)
  assert.match(result.reasons.join("\n"), /Confidence must be one of/)
  assert.match(result.reasons.join("\n"), /Scope-risk must be one of/)
})
