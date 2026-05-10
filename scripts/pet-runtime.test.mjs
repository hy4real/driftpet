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
const { runMigrations } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/migrate.js"));
const { getDatabase } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/client.js"));
const {
  AUTO_SURFACE_COOLDOWN_MS,
  decideAutoSurface,
  getLastAutoCardShownAt,
  setPetHourlyBudget
} = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/pet/runtime.js"));

const insertAutoShownAt = (db, createdAt) => {
  db.prepare("INSERT INTO events (type, payload, created_at) VALUES ('card_shown_auto', '{}', ?)").run(createdAt);
};

runMigrations();
const db = getDatabase();
const empty = decideAutoSurface();

setPetHourlyBudget(2);
const budgetShownAt = Date.now() - AUTO_SURFACE_COOLDOWN_MS - 1000;
insertAutoShownAt(db, budgetShownAt);
insertAutoShownAt(db, budgetShownAt + 1);
const budget = decideAutoSurface();

db.prepare("DELETE FROM events").run();
setPetHourlyBudget(3);
const cooldownShownAt = Date.now() - 60_000;
insertAutoShownAt(db, cooldownShownAt);
const cooldown = decideAutoSurface();
const lastShownAt = getLastAutoCardShownAt();

db.prepare("DELETE FROM events").run();
const expiredShownAt = Date.now() - AUTO_SURFACE_COOLDOWN_MS - 1000;
insertAutoShownAt(db, expiredShownAt);
const expired = decideAutoSurface();

console.log(JSON.stringify({
  empty,
  budget,
  cooldown,
  lastShownAt,
  expired,
  cooldownShownAt,
  expiredShownAt,
  cooldownMs: AUTO_SURFACE_COOLDOWN_MS
}));
`;

const runProbe = (electronScript) => new Promise((resolve, reject) => {
  const child = spawn("./node_modules/.bin/electron", ["-e", electronScript], {
    cwd: repoRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.on("error", reject);
  child.on("exit", (code) => {
    if (code === 0) {
      resolve({ stdout, stderr });
      return;
    }
    reject(new Error(stderr || stdout || `electron probe failed with code ${code}`));
  });
});

test("pet runtime gates auto surfacing by budget and quiet cooldown", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-pet-runtime-"));
  const dataDir = path.join(tmpRoot, "data");

  try {
    const { stdout } = await runProbe(buildElectronScript(dataDir));
    const lastLine = stdout.trim().split("\n").at(-1);
    const result = JSON.parse(lastLine);

    assert.equal(result.empty.allowed, true);
    assert.equal(result.empty.reason, "ok");
    assert.equal(result.empty.hourlyBudget, 3);
    assert.equal(result.empty.shownThisHour, 0);
    assert.equal(result.empty.lastShownAt, null);
    assert.equal(result.empty.cooldownRemainingMs, 0);

    assert.equal(result.budget.allowed, false);
    assert.equal(result.budget.reason, "budget_reached");
    assert.equal(result.budget.hourlyBudget, 2);
    assert.equal(result.budget.shownThisHour, 2);

    assert.equal(result.cooldown.allowed, false);
    assert.equal(result.cooldown.reason, "cooldown");
    assert.equal(result.cooldown.shownThisHour, 1);
    assert.equal(result.lastShownAt, result.cooldownShownAt);
    assert.ok(result.cooldown.cooldownRemainingMs > 0);
    assert.ok(result.cooldown.cooldownRemainingMs <= result.cooldownMs);

    assert.equal(result.expired.allowed, true);
    assert.equal(result.expired.reason, "ok");
    assert.equal(result.expired.shownThisHour, 1);
    assert.equal(result.expired.lastShownAt, result.expiredShownAt);
    assert.equal(result.expired.cooldownRemainingMs, 0);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
