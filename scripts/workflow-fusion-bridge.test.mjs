import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"

import {
  buildDispatchMarkdown,
  buildLatestReport,
  buildStatusPayload,
  buildTaskPacket,
  dedupeVerificationResults,
  evaluateWorkflowHealth,
  reportPaths,
} from "./workflow-fusion-bridge.mjs"

const config = {
  taskId: "fixture-task",
  title: "Fixture workflow task",
  taskType: "CODE_CHANGE",
  intent: "Verify workflow bridge output.",
  defaultGoal: "Produce a verifiable workflow payload.",
  scope: ["src/main/", "docs/"],
  outOfScope: ["package.json"],
  acceptance: ["guard passes", "status is review on success"],
  riskBoundary: ["do not replace .omx"],
  evidenceRefs: ["docs/plan-remaining.md"],
  sourceFiles: {
    state: ".omx/state/ralph-state.json",
    prd: ".omx/plans/prd.md",
    testSpec: ".omx/plans/test-spec.md",
    remainingPlan: "docs/plan-remaining.md",
  },
}

const ralphState = {
  current_phase: "executing",
  current_iteration_goal: "Run one bounded iteration with evidence.",
  completed_iteration_goal: "Previous iteration completed.",
}

test("buildTaskPacket projects ralph state into workflow-fusion packet", () => {
  const packet = buildTaskPacket(
    config,
    ralphState,
    "# PRD\n\nGoal line",
    "# Test Spec\n\nEvidence line",
    "# Remaining\n\nNext step line"
  )

  assert.equal(packet.task_id, "fixture-task")
  assert.equal(packet.current_state, "ROUTE_OR_EXECUTE")
  assert.equal(packet.external_status, "执行中")
  assert.equal(packet.goal, "Run one bounded iteration with evidence.")
  assert.deepEqual(packet.scope, ["src/main/", "docs/"])
  assert.equal(packet.notes.length, 3)
})

test("buildDispatchMarkdown includes required structure and scope", () => {
  const packet = buildTaskPacket(config, ralphState, "", "", "")
  const dispatch = buildDispatchMarkdown(packet)

  assert.match(dispatch, /执行线程：/)
  assert.match(dispatch, /任务ID：\n- fixture-task/)
  assert.match(dispatch, /状态：\n- 待执行/)
  assert.match(dispatch, /scope：\n- src\/main\/\n- docs\//)
})

test("buildLatestReport marks successful verification as review-ready", () => {
  const packet = buildTaskPacket(config, ralphState, "", "", "")
  const verificationStatus = {
    failed: 0,
    results: [
      { command: "npm run workflow:guard:dispatch", code: 0, ok: true },
      { command: "npm run typecheck", code: 0, ok: true },
    ],
  }
  const report = buildLatestReport(config, packet, verificationStatus, {
    commit: "abc123",
    message: "Test commit",
  })

  assert.match(report, /状态：\n- 待验收/)
  assert.match(report, /PASS npm run workflow:guard:dispatch/)
  assert.match(report, /PASS npm run typecheck/)
  assert.match(report, /commit：\n- abc123/)
})

test("buildStatusPayload dedupes verification commands and moves to review on success", () => {
  const packet = buildTaskPacket(config, ralphState, "", "", "")
  const verificationStatus = {
    failed: 0,
    results: [
      { command: "npm run workflow:guard:dispatch", code: 0, ok: true },
      { command: "npm run typecheck", code: 0, ok: true },
      { command: "npm run workflow:guard:dispatch", code: 0, ok: true },
    ],
  }
  const paths = reportPaths("fixture-task")
  const status = buildStatusPayload(packet, verificationStatus, paths, process.cwd())

  assert.equal(status.current_state, "REVIEW")
  assert.equal(status.external_status, "待验收")
  assert.equal(status.verification.length, 2)
  assert.deepEqual(
    status.verification.map((result) => result.command),
    ["npm run workflow:guard:dispatch", "npm run typecheck"]
  )
  assert.equal(status.dispatch_report, path.join(".workflow", "runtime", "reports", "fixture-task-dispatch.md"))
})

test("dedupeVerificationResults preserves first occurrence order", () => {
  const deduped = dedupeVerificationResults([
    { command: "a", code: 0, ok: true },
    { command: "b", code: 1, ok: false },
    { command: "a", code: 0, ok: true },
  ])

  assert.deepEqual(
    deduped.map((result) => result.command),
    ["a", "b"]
  )
})

test("evaluateWorkflowHealth returns ok for fresh successful status", () => {
  const packet = buildTaskPacket(config, ralphState, "", "", "")
  const status = buildStatusPayload(packet, {
    failed: 0,
    results: [{ command: "npm run typecheck", code: 0, ok: true }],
  }, reportPaths("fixture-task"), process.cwd())

  const health = evaluateWorkflowHealth({
    status,
    orchestrator: { updated_at: status.refreshed_at },
    sourceUpdatedAt: status.refreshed_at,
    now: new Date(Date.parse(status.refreshed_at) + 1000),
    staleAfterMs: 60_000,
  })

  assert.equal(health.ok, true)
  assert.equal(health.health, "ok")
  assert.equal(health.stale, false)
})

test("evaluateWorkflowHealth returns stale when source is newer than status", () => {
  const packet = buildTaskPacket(config, ralphState, "", "", "")
  const status = buildStatusPayload(packet, {
    failed: 0,
    results: [{ command: "npm run typecheck", code: 0, ok: true }],
  }, reportPaths("fixture-task"), process.cwd())

  const health = evaluateWorkflowHealth({
    status,
    orchestrator: { updated_at: new Date(Date.parse(status.refreshed_at) + 10_000).toISOString() },
    sourceUpdatedAt: new Date(Date.parse(status.refreshed_at) + 10_000).toISOString(),
    now: new Date(Date.parse(status.refreshed_at) + 11_000),
    staleAfterMs: 60_000,
  })

  assert.equal(health.ok, false)
  assert.equal(health.health, "stale")
  assert.equal(health.stale, true)
  assert.match(health.reasons[0], /older than the current \.omx source state/)
})
