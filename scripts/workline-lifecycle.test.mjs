import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();

const runElectronProbe = (electronScript) => new Promise((resolve, reject) => {
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
    if (code === 0) resolve({ stdout, stderr });
    else reject(new Error(stderr || stdout || `electron probe failed with code ${code}`));
  });
});

const parseLastJsonLine = (stdout) => JSON.parse(stdout.trim().split("\n").at(-1));

test("011 migration keeps legacy cards light instead of turning them into hot work debt", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-workline-migration-"));
  const appRoot = path.join(tmpRoot, "app");
  const dataDir = path.join(tmpRoot, "data");
  const migrationsDir = path.join(appRoot, "src/main/db/migrations");

  try {
    await fs.mkdir(migrationsDir, { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });

    const sourceMigrationsDir = path.join(repoRoot, "src/main/db/migrations");
    const migrationFiles = (await fs.readdir(sourceMigrationsDir)).filter((fileName) => fileName.endsWith(".sql"));
    for (const fileName of migrationFiles.filter((fileName) => fileName !== "011_card_lifecycle.sql")) {
      await fs.copyFile(path.join(sourceMigrationsDir, fileName), path.join(migrationsDir, fileName));
    }

    const electronScript = `
const fs = require("node:fs");
const path = require("node:path");
process.env.DRIFTPET_APP_ROOT = ${JSON.stringify(appRoot)};
process.env.DRIFTPET_DATA_DIR = ${JSON.stringify(dataDir)};
const repoRoot = ${JSON.stringify(repoRoot)};
const migrationsDir = ${JSON.stringify(migrationsDir)};
const { getDatabase, closeDatabase } = require(path.join(repoRoot, "dist-electron/src/main/db/client.js"));
const { runMigrations } = require(path.join(repoRoot, "dist-electron/src/main/db/migrate.js"));

runMigrations();
const db = getDatabase();
db.prepare("INSERT INTO items (id, source, raw_text, received_at, status, origin) VALUES (?, ?, ?, ?, ?, ?)").run(
  1,
  "manual_chaos",
  "legacy workline",
  1778400000000,
  "digested",
  "real"
);
db.prepare(\`
  INSERT INTO cards (
    id,
    item_id,
    title,
    use_for,
    knowledge_tag,
    summary_for_retrieval,
    related_card_ids,
    pet_remark,
    created_at,
    thread_cache_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
\`).run(
  1,
  1,
  "Legacy workline",
  "Keep it light",
  "workline",
  "summary",
  "[]",
  "remark",
  1778400000000,
  JSON.stringify({ chasing: "Legacy workline", nextMove: "Keep it light" })
);

fs.copyFileSync(
  path.join(repoRoot, "src/main/db/migrations/011_card_lifecycle.sql"),
  path.join(migrationsDir, "011_card_lifecycle.sql")
);
runMigrations();

const row = db.prepare("SELECT lifecycle_status, ttl_at, recover_until, last_touched_at FROM cards WHERE id = 1").get();
const hotCount = db.prepare("SELECT COUNT(*) AS count FROM cards WHERE lifecycle_status = 'hot'").get().count;
const migration = db.prepare("SELECT name FROM schema_migrations WHERE name = '011_card_lifecycle.sql'").get();
console.log(JSON.stringify({ row, hotCount, migrationApplied: Boolean(migration) }));
closeDatabase();
`;

    const { stdout } = await runElectronProbe(electronScript);
    const result = parseLastJsonLine(stdout);

    assert.equal(result.migrationApplied, true);
    assert.equal(result.row.lifecycle_status, "cooling");
    assert.equal(result.row.recover_until, null);
    assert.equal(result.row.last_touched_at, 1778400000000);
    assert.equal(typeof result.row.ttl_at, "number");
    assert.equal(result.hotCount, 0);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test("workline lifecycle transitions enforce the v0.2 hot cap, tomorrow float, and dropped recovery", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-workline-lifecycle-"));
  const dataDir = path.join(tmpRoot, "data");

  try {
    const electronScript = `
const path = require("node:path");
process.env.DRIFTPET_APP_ROOT = ${JSON.stringify(repoRoot)};
process.env.DRIFTPET_DATA_DIR = ${JSON.stringify(dataDir)};
process.env.DRIFTPET_LLM_PROVIDER = "disabled";
process.env.DRIFTPET_EMBED_PROVIDER = "disabled";

const repoRoot = ${JSON.stringify(repoRoot)};
const { closeDatabase } = require(path.join(repoRoot, "dist-electron/src/main/db/client.js"));
const { runMigrations } = require(path.join(repoRoot, "dist-electron/src/main/db/migrate.js"));
const { ingestChaosReset } = require(path.join(repoRoot, "dist-electron/src/main/ingest/ingest.js"));
const {
  HOT_WORKLINE_LIMIT,
  RECOVERY_WINDOW_MS,
  endOfLocalDay,
  endOfNextLocalDay,
  listRecoverableDroppedCards,
  updateCardLifecycle,
} = require(path.join(repoRoot, "dist-electron/src/main/workline/lifecycle.js"));
const { getAppStatus } = require(path.join(repoRoot, "dist-electron/src/main/status/app-status.js"));

(async () => {
  runMigrations();
  const now = new Date("2026-05-16T10:30:00+08:00").getTime();
  const cards = [];
  for (let index = 0; index < 4; index += 1) {
    cards.push(await ingestChaosReset("主线是第 " + index + " 条工作线，下一步是收住它。", "real"));
  }

  const initial = cards[0];
  const firstKept = updateCardLifecycle(initial.id, "continue_guarding", now);
  updateCardLifecycle(cards[1].id, "continue_guarding", now + 1);
  updateCardLifecycle(cards[2].id, "continue_guarding", now + 2);

  let hotCapError = null;
  try {
    updateCardLifecycle(cards[3].id, "continue_guarding", now + 3);
  } catch (error) {
    hotCapError = error instanceof Error ? error.message : String(error);
  }

  const tomorrow = updateCardLifecycle(cards[3].id, "tomorrow", now + 4);
  const dropped = updateCardLifecycle(firstKept.id, "drop", now + 5);
  const recoverableBeforeExpiry = listRecoverableDroppedCards(now + RECOVERY_WINDOW_MS - 1).map((card) => card.id);
  const recoverableAfterExpiry = listRecoverableDroppedCards(now + RECOVERY_WINDOW_MS + 10).map((card) => card.id);
  const recovered = updateCardLifecycle(firstKept.id, "recover", now + RECOVERY_WINDOW_MS - 1);
  const status = await getAppStatus();

  console.log(JSON.stringify({
    initialStatus: initial.lifecycleStatus,
    initialTtlAt: initial.ttlAt,
    firstKeptStatus: firstKept.lifecycleStatus,
    hotCapLimit: HOT_WORKLINE_LIMIT,
    hotCapError,
    tomorrowStatus: tomorrow.lifecycleStatus,
    tomorrowTtlAt: tomorrow.ttlAt,
    tomorrowFloatAt: tomorrow.tomorrowFloatAt,
    droppedStatus: dropped.lifecycleStatus,
    droppedRecoverUntil: dropped.recoverUntil,
    firstCardId: firstKept.id,
    recoverableBeforeExpiry,
    recoverableAfterExpiry,
    recoveredStatus: recovered.lifecycleStatus,
    recoveredTtlAt: recovered.ttlAt,
    rememberedThread: status.pet.rememberedThread
  }));
  closeDatabase();
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
`;

    const { stdout } = await runElectronProbe(electronScript);
    const result = parseLastJsonLine(stdout);
    const now = new Date("2026-05-16T10:30:00+08:00").getTime();

    assert.equal(result.initialStatus, "cooling");
    assert.equal(result.initialTtlAt, endOfDayForTest(now));
    assert.equal(result.firstKeptStatus, "hot");
    assert.match(result.hotCapError, /already guarding 3 hot worklines/);
    assert.equal(result.tomorrowStatus, "waiting");
    assert.equal(result.tomorrowTtlAt, endOfNextDayForTest(now + 4));
    assert.equal(result.tomorrowFloatAt, startOfNextDayForTest(now + 4));
    assert.equal(result.droppedStatus, "dropped");
    assert.equal(result.droppedRecoverUntil, now + 5 + 7 * 24 * 60 * 60 * 1000);
    assert.deepEqual(result.recoverableBeforeExpiry, [result.firstCardId]);
    assert.deepEqual(result.recoverableAfterExpiry, []);
    assert.equal(result.recoveredStatus, "cooling");
    assert.equal(result.recoveredTtlAt, endOfDayForTest(now + 7 * 24 * 60 * 60 * 1000 - 1));
    assert.notEqual(result.rememberedThread.cardId, result.firstCardId);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test("tomorrow worklines do not float today and cool down after one active float", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-workline-tomorrow-"));
  const dataDir = path.join(tmpRoot, "data");

  try {
    const electronScript = `
const path = require("node:path");
process.env.DRIFTPET_APP_ROOT = ${JSON.stringify(repoRoot)};
process.env.DRIFTPET_DATA_DIR = ${JSON.stringify(dataDir)};
process.env.DRIFTPET_LLM_PROVIDER = "disabled";
process.env.DRIFTPET_EMBED_PROVIDER = "disabled";

const repoRoot = ${JSON.stringify(repoRoot)};
const { getDatabase, closeDatabase } = require(path.join(repoRoot, "dist-electron/src/main/db/client.js"));
const { runMigrations } = require(path.join(repoRoot, "dist-electron/src/main/db/migrate.js"));
const { ingestChaosReset } = require(path.join(repoRoot, "dist-electron/src/main/ingest/ingest.js"));
const { updateCardLifecycle } = require(path.join(repoRoot, "dist-electron/src/main/workline/lifecycle.js"));
const { getAppStatus } = require(path.join(repoRoot, "dist-electron/src/main/status/app-status.js"));

const startOfNextDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  return date.getTime();
};

(async () => {
  runMigrations();
  const now = new Date("2026-05-16T10:30:00+08:00").getTime();
  const card = await ingestChaosReset("主线是明天再接的工作线，下一步是明天只浮一次。", "real");
  updateCardLifecycle(card.id, "tomorrow", now);

  Date.now = () => now + 60 * 1000;
  const sameDayStatus = await getAppStatus();

  Date.now = () => startOfNextDay(now) + 60 * 1000;
  const floatedStatus = await getAppStatus();
  const rowAfterFloat = getDatabase().prepare("SELECT lifecycle_status, tomorrow_floated_at FROM cards WHERE id = ?").get(card.id);

  Date.now = () => startOfNextDay(startOfNextDay(now)) + 60 * 1000;
  const afterUntouchedDayStatus = await getAppStatus();
  const rowAfterCooling = getDatabase().prepare("SELECT lifecycle_status, ttl_at FROM cards WHERE id = ?").get(card.id);

  console.log(JSON.stringify({
    cardId: card.id,
    sameDayRemembered: sameDayStatus.pet.rememberedThread,
    floatedRemembered: floatedStatus.pet.rememberedThread,
    rowAfterFloat,
    afterUntouchedDayRemembered: afterUntouchedDayStatus.pet.rememberedThread,
    rowAfterCooling
  }));
  closeDatabase();
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
`;

    const { stdout } = await runElectronProbe(electronScript);
    const result = parseLastJsonLine(stdout);

    assert.equal(result.sameDayRemembered, null);
    assert.equal(result.floatedRemembered.cardId, result.cardId);
    assert.equal(result.rowAfterFloat.lifecycle_status, "waiting");
    assert.equal(typeof result.rowAfterFloat.tomorrow_floated_at, "number");
    assert.equal(result.afterUntouchedDayRemembered, null);
    assert.equal(result.rowAfterCooling.lifecycle_status, "cooling");
    assert.equal(typeof result.rowAfterCooling.ttl_at, "number");
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

test("daily close-line candidates appear once and skip returns them to light cooling", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-workline-close-line-"));
  const dataDir = path.join(tmpRoot, "data");

  try {
    const electronScript = `
const path = require("node:path");
process.env.DRIFTPET_APP_ROOT = ${JSON.stringify(repoRoot)};
process.env.DRIFTPET_DATA_DIR = ${JSON.stringify(dataDir)};
process.env.DRIFTPET_LLM_PROVIDER = "disabled";
process.env.DRIFTPET_EMBED_PROVIDER = "disabled";

const repoRoot = ${JSON.stringify(repoRoot)};
const { getDatabase, closeDatabase } = require(path.join(repoRoot, "dist-electron/src/main/db/client.js"));
const { runMigrations } = require(path.join(repoRoot, "dist-electron/src/main/db/migrate.js"));
const { ingestChaosReset } = require(path.join(repoRoot, "dist-electron/src/main/ingest/ingest.js"));
const {
  skipDailyCloseLine,
  takeDailyCloseLineCandidates,
  updateCardLifecycle,
} = require(path.join(repoRoot, "dist-electron/src/main/workline/lifecycle.js"));

(async () => {
  runMigrations();
  const yesterday = new Date("2026-05-15T10:30:00+08:00").getTime();
  const today = new Date("2026-05-16T10:30:00+08:00").getTime();
  const card = await ingestChaosReset("主线是昨天还在守的线，今天先问一次还守不守。", "real");
  updateCardLifecycle(card.id, "continue_guarding", yesterday);

  const firstCandidates = takeDailyCloseLineCandidates(today).map((entry) => entry.id);
  const secondCandidates = takeDailyCloseLineCandidates(today).map((entry) => entry.id);
  const skipped = skipDailyCloseLine(firstCandidates, today);
  const row = getDatabase().prepare("SELECT lifecycle_status, ttl_at FROM cards WHERE id = ?").get(card.id);
  const eventCount = getDatabase().prepare("SELECT COUNT(*) AS count FROM events WHERE type IN ('daily_close_line_shown', 'daily_close_line_skipped')").get().count;

  console.log(JSON.stringify({
    cardId: card.id,
    firstCandidates,
    secondCandidates,
    skipped,
    row,
    eventCount
  }));
  closeDatabase();
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
`;

    const { stdout } = await runElectronProbe(electronScript);
    const result = parseLastJsonLine(stdout);

    assert.deepEqual(result.firstCandidates, [result.cardId]);
    assert.deepEqual(result.secondCandidates, []);
    assert.equal(result.skipped, 1);
    assert.equal(result.row.lifecycle_status, "cooling");
    assert.equal(result.row.ttl_at, endOfDayForTest(new Date("2026-05-16T10:30:00+08:00").getTime()));
    assert.equal(result.eventCount, 2);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});

const endOfDayForTest = (value) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

const endOfNextDayForTest = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

const startOfNextDayForTest = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  return date.getTime();
};
