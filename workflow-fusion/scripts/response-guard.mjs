#!/usr/bin/env node

import fs from "node:fs/promises"

const ALLOWED_STATUSES = new Set([
  "待执行",
  "执行中",
  "待验收",
  "已通过",
  "未通过",
  "阻塞",
  "作废",
])

const REPORT_FIELDS = [
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
]

const DISPATCH_FIELDS = [
  "执行线程",
  "任务ID",
  "标题",
  "简短描述",
  "状态",
  "内部状态",
  "执行顺序",
  "前置任务",
  "scope",
  "out_of_scope",
  "acceptance",
  "risk_boundary",
  "按线程规则执行",
  "是否需要提交代码",
  "是否进行QA验收",
  "QA参与",
  "QA验收方式",
  "report_format",
  "files",
  "action",
  "verify",
  "done",
]

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (!key.startsWith("--")) continue
    args[key.slice(2)] = argv[i + 1]
    i += 1
  }
  return args
}

function findFieldIndexes(text, fields) {
  const indexes = []
  const missing = []

  for (const field of fields) {
    const regex = new RegExp(`^${escapeRegExp(field)}\\s*[:：]\\s*$`, "m")
    const match = regex.exec(text)
    if (!match) {
      missing.push(field)
      continue
    }
    indexes.push({ field, index: match.index })
  }

  return { indexes, missing }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractFieldBlock(text, field) {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const start = lines.findIndex((line) => new RegExp(`^${escapeRegExp(field)}\\s*[:：]\\s*$`).test(line))
  if (start === -1) return ""

  const values = []
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^[^\s][^:：]*\s*[:：]\s*$/.test(line)) break
    values.push(line)
  }

  return values.join("\n").trim()
}

function validateOrder(indexes) {
  for (let i = 1; i < indexes.length; i += 1) {
    if (indexes[i].index <= indexes[i - 1].index) return false
  }
  return true
}

function validateReport(text) {
  const reasons = []
  const { indexes, missing } = findFieldIndexes(text, REPORT_FIELDS)

  for (const field of missing) {
    reasons.push(`缺少字段 \`${field}\``)
  }

  if (missing.length === 0 && !validateOrder(indexes)) {
    reasons.push("字段顺序不正确")
  }

  const taskIdBlock = extractFieldBlock(text, "任务ID")
  if (!/-\s*\S+/.test(taskIdBlock)) {
    reasons.push("`任务ID` 缺少有效值")
  }

  const statusBlock = extractFieldBlock(text, "状态")
  const statusMatch = statusBlock.match(/-\s*(.+)/)
  const status = statusMatch?.[1]?.trim()
  if (!status || !ALLOWED_STATUSES.has(status)) {
    reasons.push("`状态` 不在允许的 7 个值中")
  }

  const qaBlock = extractFieldBlock(text, "是否进行QA验收")
  if (!/-\s*(是|否)\s*$/.test(qaBlock)) {
    reasons.push("`是否进行QA验收` 必须为 是 或 否")
  }

  const nextStepBlock = extractFieldBlock(text, "最小下一步")
  if (status === "阻塞" && !/-\s*\S+/.test(nextStepBlock.replace(/-\s*无\s*$/m, ""))) {
    reasons.push("阻塞状态必须提供非空的 `最小下一步`")
  }

  return { ok: reasons.length === 0, reasons }
}

function validateDispatch(text) {
  const reasons = []
  const { indexes, missing } = findFieldIndexes(text, DISPATCH_FIELDS)

  for (const field of missing) {
    reasons.push(`缺少字段 \`${field}\``)
  }

  if (missing.length === 0 && !validateOrder(indexes)) {
    reasons.push("字段顺序不正确")
  }

  const statusBlock = extractFieldBlock(text, "状态")
  if (!/-\s*待执行\s*$/.test(statusBlock)) {
    reasons.push("派发模板中的 `状态` 必须为 `待执行`")
  }

  return { ok: reasons.length === 0, reasons }
}

const args = parseArgs(process.argv.slice(2))
const kind = args.kind
const file = args.file

if (!kind || !["report", "dispatch"].includes(kind)) {
  throw new Error("use --kind report|dispatch")
}

if (!file) {
  throw new Error("use --file /absolute/path/to/file.md")
}

const text = await fs.readFile(file, "utf8")
const result = kind === "report" ? validateReport(text) : validateDispatch(text)

console.log(JSON.stringify(result, null, 2))
process.exitCode = result.ok ? 0 : 1
