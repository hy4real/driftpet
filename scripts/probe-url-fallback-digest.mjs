#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-url-fallback-probe-"));
const dataDir = path.join(tmpRoot, "data");

const electronScript = `
const path = require("node:path");
process.env.DRIFTPET_APP_ROOT = ${JSON.stringify(repoRoot)};
process.env.DRIFTPET_DATA_DIR = ${JSON.stringify(dataDir)};
process.env.DRIFTPET_ENV_PATH = ${JSON.stringify(path.join(tmpRoot, ".env.empty"))};
process.env.DRIFTPET_LLM_PROVIDER = "anthropic";
process.env.ANTHROPIC_API_KEY = "";
process.env.DRIFTPET_LLM_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.DEEPSEEK_API_KEY = "";
process.env.DRIFTPET_EMBED_PROVIDER = "disabled";
const { generateDigestDraft } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/llm/digest-card.js"));

(async () => {
  const result = await generateDigestDraft({
    source: "tg_url",
    rawText: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API",
    rawUrl: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API",
    extractedTitle: "Fetch API - Web APIs | MDN",
    extractedText: "Concepts and usage The Fetch API uses Request and Response objects and related concepts such as CORS. For making a request and fetching a resource, use the fetch() method."
  }, []);

  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
`;

function runElectronProbe() {
  return new Promise((resolve, reject) => {
    const child = spawn("./node_modules/.bin/electron", ["-e", electronScript], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || stdout || `electron probe failed with code ${code}`));
      }
    });
  });
}

try {
  const result = await runElectronProbe();
  process.stdout.write(result.stdout);
  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }
} finally {
  await fs.rm(tmpRoot, { recursive: true, force: true });
}
