#!/usr/bin/env node

import { spawn } from "node:child_process"

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`))
    })
  })
}

await run("git", ["config", "core.hooksPath", ".githooks"])
