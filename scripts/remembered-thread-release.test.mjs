import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();

const buildElectronScript = (dataDir) => `
const path = require("node:path");
process.env.DRIFTPET_APP_ROOT = ${JSON.stringify(repoRoot)};
process.env.DRIFTPET_DATA_DIR = ${JSON.stringify(dataDir)};
process.env.DRIFTPET_LLM_PROVIDER = "disabled";
process.env.DRIFTPET_EMBED_PROVIDER = "disabled";

const { runMigrations } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/migrate.js"));
const { ingestChaosReset } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/ingest/ingest.js"));
const { getAppStatus, releaseRememberedThread } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/status/app-status.js"));

(async () => {
  runMigrations();

  const first = await ingestChaosReset("主线是第一条真实守线，下一步是写第一条检查项。", "real");
  const beforeRelease = await getAppStatus();
  releaseRememberedThread(first.id);
  const afterRelease = await getAppStatus();
  const second = await ingestChaosReset("主线是放下之后的新守线，下一步是确认它会重新出现。", "real");
  const afterNewCard = await getAppStatus();

  console.log(JSON.stringify({
    firstCardId: first.id,
    secondCardId: second.id,
    beforeRelease: beforeRelease.pet.rememberedThread,
    afterRelease: afterRelease.pet.rememberedThread,
    afterNewCard: afterNewCard.pet.rememberedThread
  }));
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
`;

const runProbe = (electronScript) => new Promise((resolve, reject) => {
  const child = spawn("./node_modules/.bin/electron", ["-e", electronScript], {
    cwd: repoRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.on("error", reject);
  child.on("exit", (code) => {
    if (code === 0) resolve({ stdout, stderr });
    else reject(new Error(stderr || stdout || `electron probe failed with code ${code}`));
  });
});

test("released remembered thread stays in history but stops being guarded until a newer card lands", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-release-thread-"));
  const dataDir = path.join(tmpRoot, "data");
  try {
    const { stdout } = await runProbe(buildElectronScript(dataDir));
    const lastLine = stdout.trim().split("\n").at(-1);
    const result = JSON.parse(lastLine);

    assert.equal(result.beforeRelease.cardId, result.firstCardId, "new real card should become remembered thread before release");
    assert.equal(result.afterRelease, null, "released thread should stop being guarded");
    assert.equal(result.afterNewCard.cardId, result.secondCardId, "newer card should become the guarded thread after release");
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
