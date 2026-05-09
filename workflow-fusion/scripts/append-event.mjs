#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (!key.startsWith("--")) continue
    const value = argv[i + 1]
    args[key.slice(2)] = value
    i += 1
  }
  return args
}

function required(args, name) {
  const value = args[name]
  if (!value) {
    throw new Error(`missing required argument --${name}`)
  }
  return value
}

const args = parseArgs(process.argv.slice(2))

const file = required(args, "file")
const payloadText = args.payload ?? "{}"

let payload
try {
  payload = JSON.parse(payloadText)
} catch (error) {
  throw new Error(`invalid JSON in --payload: ${error.message}`)
}

const event = {
  v: 1,
  ts: new Date().toISOString(),
  event_id: args["event-id"] ?? `evt_${Date.now()}`,
  type: required(args, "type"),
  from: required(args, "from"),
  to: required(args, "to"),
  task_id: required(args, "task-id"),
  state: required(args, "state"),
  external_status: args["external-status"] ?? null,
  severity: args.severity ?? "info",
  caused_by: args["caused-by"] ?? "manual",
  evidence_refs: args["evidence-refs"] ? args["evidence-refs"].split(",") : [],
  payload,
}

await fs.mkdir(path.dirname(file), { recursive: true })
await fs.appendFile(file, `${JSON.stringify(event)}\n`, "utf8")

console.log(JSON.stringify({ ok: true, file, event_id: event.event_id }))
