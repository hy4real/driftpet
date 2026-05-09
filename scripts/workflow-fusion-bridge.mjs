#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { pathToFileURL } from "node:url"

const repoRoot = process.cwd()
const workflowDir = path.join(repoRoot, "workflow-fusion")
const bridgeConfigFile = path.join(workflowDir, "driftpet.config.json")
const runtimeDir = path.join(repoRoot, ".workflow", "runtime")
const runtimeTasksDir = path.join(runtimeDir, "tasks")
const runtimeStateDir = path.join(runtimeDir, "state")
const runtimeReportsDir = path.join(runtimeDir, "reports")
const runtimeEventsDir = path.join(runtimeDir, "events")
const appendEventScript = path.join(workflowDir, "scripts", "append-event.mjs")

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]
    if (!value.startsWith("--")) {
      args._.push(value)
      continue
    }

    const key = value.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith("--")) {
      args[key] = true
      continue
    }

    args[key] = next
    i += 1
  }
  return args
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"))
}

async function readMaybe(file) {
  try {
    return await fs.readFile(file, "utf8")
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null
    }
    throw error
  }
}

async function readStatMaybe(file) {
  try {
    return await fs.stat(file)
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null
    }
    throw error
  }
}

export function compactText(text, fallback = "无") {
  if (!text) return fallback
  return text.replace(/\s+/g, " ").trim() || fallback
}

export function mapPhaseToWorkflowState(phase) {
  switch (phase) {
    case "planning":
      return "FREEZE_MIN"
    case "executing":
      return "ROUTE_OR_EXECUTE"
    case "verifying":
      return "REVIEW"
    case "blocked":
      return "BLOCKED"
    case "done":
      return "DONE"
    default:
      return "USER_UPDATE"
  }
}

export function mapPhaseToExternalStatus(phase) {
  switch (phase) {
    case "planning":
      return "待执行"
    case "executing":
      return "执行中"
    case "verifying":
      return "待验收"
    case "blocked":
      return "阻塞"
    case "done":
      return "已通过"
    default:
      return "执行中"
  }
}

export function summarizeDoc(text) {
  return compactText(text?.split("\n").slice(0, 8).join(" "))
}

async function ensureRuntimeDirs() {
  await Promise.all([
    fs.mkdir(runtimeTasksDir, { recursive: true }),
    fs.mkdir(runtimeStateDir, { recursive: true }),
    fs.mkdir(runtimeReportsDir, { recursive: true }),
    fs.mkdir(runtimeEventsDir, { recursive: true }),
  ])
}

export function reportPaths(taskId) {
  return {
    task: path.join(runtimeTasksDir, `${taskId}.json`),
    state: path.join(runtimeStateDir, "orchestrator.json"),
    dispatch: path.join(runtimeReportsDir, `${taskId}-dispatch.md`),
    latest: path.join(runtimeReportsDir, `${taskId}-latest.md`),
    events: path.join(runtimeEventsDir, "task-events.jsonl"),
    status: path.join(runtimeDir, "status.json"),
  }
}

export function buildTaskPacket(config, ralphState, prdText, testSpecText, remainingText) {
  const currentPhase = ralphState.current_phase ?? "executing"

  return {
    task_id: config.taskId,
    title: config.title,
    task_type: config.taskType,
    intent: config.intent,
    goal: compactText(
      ralphState.current_iteration_goal
        ?? ralphState.task_description
        ?? config.defaultGoal
    ),
    scope: config.scope,
    out_of_scope: config.outOfScope,
    required_agent: "executor",
    mode: "solo",
    acceptance: config.acceptance,
    risk_boundary: config.riskBoundary,
    evidence_refs: config.evidenceRefs,
    current_state: mapPhaseToWorkflowState(currentPhase),
    external_status: mapPhaseToExternalStatus(currentPhase),
    report_format: [
      "执行线程",
      "任务ID",
      "状态",
      "是否进行QA验收",
      "QA说明",
      "files",
      "action",
      "verify",
      "done",
      "blockers",
      "最小下一步",
      "commit",
      "提交信息",
    ],
    rollback_hint: "Delete `.workflow/runtime/` to remove the projection layer. Leave `.omx/` intact.",
    caused_by: "user_request",
    source_of_truth: config.sourceFiles,
    notes: [summarizeDoc(prdText), summarizeDoc(testSpecText), summarizeDoc(remainingText)],
  }
}

export function buildOrchestratorState(config, ralphState, taskPacket) {
  return {
    task_id: config.taskId,
    current_state: taskPacket.current_state,
    external_status: taskPacket.external_status,
    updated_at: new Date().toISOString(),
    active_agent: "orchestrator",
    next_step: compactText(
      ralphState.current_iteration_goal
        ?? ralphState.completed_iteration_goal
        ?? "Inspect current OMX goal and continue the next bounded iteration."
    ),
    risk: [
      "`.workflow/runtime` is a mirror of `.omx` state and can go stale if `npm run workflow:refresh` is not rerun after a task update.",
    ],
    source_state_file: config.sourceFiles.state,
  }
}

export function buildDispatchMarkdown(taskPacket) {
  return `执行线程：
- orchestrator

任务ID：
- ${taskPacket.task_id}

标题：
- ${taskPacket.title}

简短描述：
- ${taskPacket.goal}

状态：
- 待执行

内部状态：
- ${taskPacket.current_state}

执行顺序：
- 当前唯一任务

前置任务：
- 无

scope：
- ${taskPacket.scope.join("\n- ")}

out_of_scope：
- ${taskPacket.out_of_scope.join("\n- ")}

acceptance：
- ${taskPacket.acceptance.join("\n- ")}

risk_boundary：
- ${taskPacket.risk_boundary.join("\n- ")}

按线程规则执行：
- AGENTS.md
- workflow-fusion/docs/workflow-spec.md

是否需要提交代码：
- 需要

是否进行QA验收：
- 视本轮改动决定

QA参与：
- 否

QA验收方式：
- 正常验收

report_format：
- 必须按固定回报模板输出
- 若状态为阻塞，必须写出阻塞条件和最小下一步

files：
- ${taskPacket.scope.join("\n- ")}

action：
- 从 \`.omx\` 当前目标继续本轮实现或验证
- 完成后刷新 \`.workflow/runtime\`

verify：
- 运行本轮需要的 typecheck/build/probe
- 必要时刷新 \`reports/\` 输出

done：
- 说明本轮真实完成项、验证证据和剩余风险
`
}

export function buildLatestReport(config, taskPacket, verificationStatus, gitInfo) {
  const verificationLines = verificationStatus.results.map((result) => {
    const symbol = result.ok ? "PASS" : "FAIL"
    return `- ${symbol} ${result.command}`
  })

  const doneLines = [
    "`workflow-fusion` 已作为 `.omx` 上方的协议层接入，不与主状态源竞争",
    "当前 task packet、orchestrator state、dispatch report、latest report 和 events 已可从统一入口刷新",
    verificationStatus.failed === 0
      ? "全部标准验证命令通过，当前桥接链路处于可用状态"
      : "存在未通过验证，当前报告仅说明桥接生成成功但仓库级验证未完全通过",
  ]

  return `执行线程：
- executor

任务ID：
- ${taskPacket.task_id}

状态：
- ${verificationStatus.failed === 0 ? "待验收" : "阻塞"}

是否进行QA验收：
- 否

QA说明：
- 当前为 Workflow Fusion bridge 自动回报，未进入独立 QA lane。

files：
- .gitignore
- README.md
- package.json
- docs/workflow-fusion-adoption.md
- scripts/workflow-fusion-bridge.mjs
- workflow-fusion/

action：
- 读取当前 \`.omx\` Ralph 状态与计划文档
- 刷新 \`.workflow/runtime\` 中的 task packet、orchestrator state 与 dispatch
- 运行标准 workflow 守卫和仓库验证命令
- 生成最新结构化回报并记录验证结果

verify：
${verificationLines.join("\n")}

done：
- ${doneLines.join("\n- ")}

blockers：
- ${verificationStatus.failed === 0 ? "无" : verificationStatus.results.filter((result) => !result.ok).map((result) => result.command).join("\n- ")}

最小下一步：
- ${verificationStatus.failed === 0 ? "无" : "修复失败的验证命令后重新运行 \\`npm run workflow:refresh\\`"}

commit：
- ${gitInfo.commit}

提交信息：
- ${gitInfo.message}
`
}

async function runCommand(command, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: repoRoot,
      shell: true,
      stdio: "inherit",
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      const result = { command, code, ok: code === 0 }
      if (code === 0 || allowFailure) resolve(result)
      else reject(Object.assign(new Error(`command failed: ${command}`), { result }))
    })
  })
}

async function appendEvent({ type, taskId, state, externalStatus, from, to, causedBy, payload }) {
  const args = [
    appendEventScript,
    "--file",
    reportPaths(taskId).events,
    "--type",
    type,
    "--task-id",
    taskId,
    "--state",
    state,
    "--external-status",
    externalStatus,
    "--from",
    from,
    "--to",
    to,
    "--caused-by",
    causedBy,
    "--payload",
    JSON.stringify(payload),
  ]

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      stdio: "inherit",
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`append-event exited with code ${code}`))
    })
  })
}

async function loadContext() {
  const config = await readJson(bridgeConfigFile)
  const sourceFiles = Object.fromEntries(
    Object.entries(config.sourceFiles).map(([key, relative]) => [key, path.join(repoRoot, relative)])
  )
  const [ralphState, prdText, testSpecText, remainingText] = await Promise.all([
    readJson(sourceFiles.state),
    readMaybe(sourceFiles.prd),
    readMaybe(sourceFiles.testSpec),
    readMaybe(sourceFiles.remainingPlan),
  ])

  return { config, ralphState, prdText, testSpecText, remainingText }
}

async function getGitInfo() {
  const [commitResult, messageResult] = await Promise.all([
    runGitCapture("git rev-parse --short HEAD"),
    runGitCapture("git log -1 --pretty=%s"),
  ])

  return {
    commit: commitResult || "无",
    message: messageResult || "无",
  }
}

async function runGitCapture(command) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: repoRoot,
      shell: true,
      stdio: ["ignore", "pipe", "ignore"],
    })

    let output = ""
    child.stdout.on("data", (chunk) => {
      output += chunk.toString()
    })
    child.on("error", () => resolve(""))
    child.on("exit", (code) => resolve(code === 0 ? output.trim() : ""))
  })
}

async function syncWorkflow() {
  await ensureRuntimeDirs()

  const { config, ralphState, prdText, testSpecText, remainingText } = await loadContext()
  const paths = reportPaths(config.taskId)
  const taskPacket = buildTaskPacket(config, ralphState, prdText, testSpecText, remainingText)
  const orchestratorState = buildOrchestratorState(config, ralphState, taskPacket)
  const dispatch = buildDispatchMarkdown(taskPacket)

  await Promise.all([
    fs.writeFile(paths.task, `${JSON.stringify(taskPacket, null, 2)}\n`, "utf8"),
    fs.writeFile(paths.state, `${JSON.stringify(orchestratorState, null, 2)}\n`, "utf8"),
    fs.writeFile(paths.dispatch, dispatch, "utf8"),
  ])

  await appendEvent({
    type: "TASK_PACKET_WRITTEN",
    taskId: config.taskId,
    state: orchestratorState.current_state,
    externalStatus: orchestratorState.external_status,
    from: "orchestrator",
    to: "orchestrator",
    causedBy: "workflow_refresh",
    payload: {
      summary: "synced Workflow Fusion runtime from current .omx ralph state",
      source_state_file: config.sourceFiles.state,
    },
  })

  return { config, taskPacket, orchestratorState, paths }
}

async function validateWorkflow(config) {
  const results = []
  for (const command of config.verificationCommands) {
    const result = await runCommand(command, { allowFailure: true })
    results.push(result)
  }

  return {
    results,
    failed: results.filter((result) => !result.ok).length,
  }
}

export function dedupeVerificationResults(results) {
  const dedupedVerification = []
  const seenCommands = new Set()
  for (const result of results) {
    if (seenCommands.has(result.command)) continue
    seenCommands.add(result.command)
    dedupedVerification.push(result)
  }
  return dedupedVerification
}

export function buildStatusPayload(taskPacket, verificationStatus, paths, baseDir = repoRoot) {
  const health = verificationStatus.failed === 0 ? "ok" : "blocked"
  return {
    task_id: taskPacket.task_id,
    external_status: verificationStatus.failed === 0 ? "待验收" : "阻塞",
    current_state: verificationStatus.failed === 0 ? "REVIEW" : "BLOCKED",
    refreshed_at: new Date().toISOString(),
    health,
    stale: false,
    dispatch_report: path.relative(baseDir, paths.dispatch),
    latest_report: path.relative(baseDir, paths.latest),
    verification: dedupeVerificationResults(verificationStatus.results),
  }
}

export function evaluateWorkflowHealth({
  status,
  orchestrator,
  sourceUpdatedAt,
  now = new Date(),
  staleAfterMs = null,
}) {
  if (!status) {
    return {
      ok: false,
      health: "missing",
      stale: true,
      reasons: ["workflow status has not been generated yet"],
    }
  }

  const reasons = []
  let stale = Boolean(status.stale)
  let health = status.health ?? "ok"

  const refreshedAtMs = Date.parse(status.refreshed_at ?? "")
  const sourceUpdatedAtMs = sourceUpdatedAt ? Date.parse(sourceUpdatedAt) : Number.NaN
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now)

  if (!Number.isNaN(sourceUpdatedAtMs) && !Number.isNaN(refreshedAtMs) && sourceUpdatedAtMs > refreshedAtMs) {
    stale = true
    reasons.push("workflow projection is older than the current .omx source state")
  }

  if (typeof staleAfterMs === "number" && staleAfterMs >= 0 && !Number.isNaN(refreshedAtMs) && !Number.isNaN(nowMs) && nowMs - refreshedAtMs > staleAfterMs) {
    stale = true
    reasons.push("workflow projection is older than the freshness threshold")
  }

  const failedVerification = (status.verification ?? []).filter((result) => !result.ok)
  if (failedVerification.length > 0) {
    health = "blocked"
    reasons.push(...failedVerification.map((result) => `verification failed: ${result.command}`))
  }

  if (stale && health === "ok") {
    health = "stale"
  }

  if (!orchestrator) {
    reasons.push("orchestrator state is missing")
  }

  return {
    ok: reasons.length === 0 && health === "ok" && !stale,
    health,
    stale,
    reasons,
  }
}

async function writeStatus(taskPacket, orchestratorState, verificationStatus, paths) {
  const status = buildStatusPayload(taskPacket, verificationStatus, paths)
  await fs.writeFile(paths.status, `${JSON.stringify(status, null, 2)}\n`, "utf8")
  return status
}

async function refreshWorkflow() {
  const { config, taskPacket, orchestratorState, paths } = await syncWorkflow()
  const verificationStatus = await validateWorkflow(config)
  const gitInfo = await getGitInfo()
  const latestReport = buildLatestReport(config, taskPacket, verificationStatus, gitInfo)

  await fs.writeFile(paths.latest, latestReport, "utf8")

  const guardResult = await runCommand("npm run workflow:guard:report", { allowFailure: true })
  verificationStatus.results.push(guardResult)
  if (!guardResult.ok) verificationStatus.failed += 1

  const status = await writeStatus(taskPacket, orchestratorState, verificationStatus, paths)

  await appendEvent({
    type: verificationStatus.failed === 0 ? "REPORT_VALIDATED" : "REPORT_BLOCKED",
    taskId: config.taskId,
    state: status.current_state,
    externalStatus: status.external_status,
    from: "executor",
    to: "orchestrator",
    causedBy: "workflow_refresh",
    payload: {
      summary: verificationStatus.failed === 0
        ? "workflow refresh completed with all verification commands passing"
        : "workflow refresh completed but one or more verification commands failed",
      report: path.relative(repoRoot, paths.latest),
      failed_commands: verificationStatus.results.filter((result) => !result.ok).map((result) => result.command),
    },
  })

  console.log(JSON.stringify({
    ok: verificationStatus.failed === 0,
    taskPacket: path.relative(repoRoot, paths.task),
    orchestratorState: path.relative(repoRoot, paths.state),
    dispatch: path.relative(repoRoot, paths.dispatch),
    latest: path.relative(repoRoot, paths.latest),
    status: path.relative(repoRoot, paths.status),
    failedChecks: verificationStatus.results.filter((result) => !result.ok).map((result) => result.command),
  }, null, 2))

  if (verificationStatus.failed > 0) {
    process.exitCode = 1
  }
}

async function showStatus() {
  const config = await readJson(bridgeConfigFile)
  const paths = reportPaths(config.taskId)
  const [statusText, stateText, sourceStat] = await Promise.all([
    readMaybe(paths.status),
    readMaybe(paths.state),
    readStatMaybe(path.join(repoRoot, config.sourceFiles.state)),
  ])

  const status = statusText ? JSON.parse(statusText) : null
  const state = stateText ? JSON.parse(stateText) : null
  const health = evaluateWorkflowHealth({
    status,
    orchestrator: state,
    sourceUpdatedAt: sourceStat?.mtime.toISOString(),
  })

  console.log(JSON.stringify({
    taskId: config.taskId,
    status: status ?? {
      current_state: "INTAKE",
      external_status: "待执行",
      note: "No workflow status has been generated yet. Run `npm run workflow:refresh`.",
    },
    orchestrator: state,
    sourceUpdatedAt: sourceStat?.mtime.toISOString() ?? null,
    health,
  }, null, 2))
}

async function checkWorkflow() {
  const config = await readJson(bridgeConfigFile)
  const paths = reportPaths(config.taskId)
  const [statusText, stateText, sourceStat] = await Promise.all([
    readMaybe(paths.status),
    readMaybe(paths.state),
    readStatMaybe(path.join(repoRoot, config.sourceFiles.state)),
  ])

  const status = statusText ? JSON.parse(statusText) : null
  const state = stateText ? JSON.parse(stateText) : null
  const health = evaluateWorkflowHealth({
    status,
    orchestrator: state,
    sourceUpdatedAt: sourceStat?.mtime.toISOString(),
  })

  console.log(JSON.stringify({
    taskId: config.taskId,
    sourceUpdatedAt: sourceStat?.mtime.toISOString() ?? null,
    health,
  }, null, 2))

  if (!health.ok) {
    process.exitCode = 1
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const command = args._[0] ?? "sync"

  if (command === "sync") {
    const { paths } = await syncWorkflow()
    console.log(JSON.stringify({
      ok: true,
      taskPacket: path.relative(repoRoot, paths.task),
      orchestratorState: path.relative(repoRoot, paths.state),
      dispatch: path.relative(repoRoot, paths.dispatch),
    }, null, 2))
    return
  }

  if (command === "refresh") {
    await refreshWorkflow()
    return
  }

  if (command === "status") {
    await showStatus()
    return
  }

  if (command === "check") {
    await checkWorkflow()
    return
  }

  throw new Error(`unknown command: ${command}`)
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false

if (isMain) {
  await main()
}
