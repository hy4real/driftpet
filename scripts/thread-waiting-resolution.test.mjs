import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const localTempRoot = path.resolve(".tmp");

const buildModule = async (entryPoint, outfileName) => {
  await fs.mkdir(localTempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(localTempRoot, `driftpet-${outfileName}-`));
  const outfile = path.join(tempDir, `${outfileName}.cjs`);

  await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile,
    loader: {
      ".ts": "ts",
    },
  });

  return {
    moduleExports: require(outfile),
    cleanupBundle: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
};

test("clearResolvedWaiting clears waiting fields and records resolution time", async () => {
  const { moduleExports, cleanupBundle } = await buildModule(
    path.resolve("src/main/claude/waiting-resolution.ts"),
    "waiting-resolution"
  );

  try {
    const { clearResolvedWaiting } = moduleExports;
    const resolvedAt = 1778500000123;
    const result = clearResolvedWaiting({
      chasing: "Ship the waiting flow",
      workingJudgment: "A is blocked, B can move.",
      ruledOut: null,
      nextMove: "先把 B 的验收补完。",
      meanwhile: "先把 B 的验收补完。",
      waitingOn: "A 还在等别人回复",
      sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
      expiresWhen: "when A replies",
    }, resolvedAt);

    assert.equal(result.waitingOn, null);
    assert.equal(result.meanwhile, null);
    assert.equal(result.waitingResolvedAt, resolvedAt);
    assert.equal(result.sideThread, "A 还在等别人回复，回音没来前先别围着它空转。");
  } finally {
    await cleanupBundle();
  }
});

test("resolved waiting reminder does not fall back to legacy side-thread waiting text", async () => {
  const { moduleExports, cleanupBundle } = await buildModule(
    path.resolve("src/renderer/thread-cache-waiting.ts"),
    "thread-cache-waiting"
  );

  try {
    const { getThreadWaitingReminder } = moduleExports;
    const reminder = getThreadWaitingReminder({
      createdAt: 1778400000000,
      threadCache: {
        chasing: "Ship the waiting flow",
        workingJudgment: null,
        ruledOut: null,
        nextMove: "继续把结果整理进主线。",
        meanwhile: null,
        waitingOn: null,
        waitingResolvedAt: 1778500000123,
        sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
        expiresWhen: "when A replies",
      },
    }, 1778500001123);

    assert.equal(reminder.state, "resolved");
    assert.equal(reminder.age, "resolved_fresh");
    assert.equal(reminder.waitingOn, null);
    assert.equal(reminder.meanwhile, null);
  } finally {
    await cleanupBundle();
  }
});

test("waiting reminder escalates from fresh to cooling to cold by thread age", async () => {
  const { moduleExports, cleanupBundle } = await buildModule(
    path.resolve("src/renderer/thread-cache-waiting.ts"),
    "thread-cache-waiting-age"
  );

  try {
    const { getThreadWaitingReminder } = moduleExports;
    const baseCard = {
      createdAt: 1778400000000,
      threadCache: {
        chasing: "Ship the waiting flow",
        workingJudgment: null,
        ruledOut: null,
        nextMove: "先把 B 的验收补完。",
        meanwhile: "先把 B 的验收补完。",
        waitingOn: "A 还在等别人回复",
        waitingResolvedAt: null,
        sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
        expiresWhen: "when A replies",
      },
    };

    assert.equal(getThreadWaitingReminder(baseCard, 1778400000000 + 30 * 60 * 1000).age, "fresh");
    assert.equal(getThreadWaitingReminder(baseCard, 1778400000000 + 3 * 60 * 60 * 1000).age, "cooling");
    assert.equal(getThreadWaitingReminder(baseCard, 1778400000000 + 30 * 60 * 60 * 1000).age, "cold");
  } finally {
    await cleanupBundle();
  }
});

test("waiting reminder cadence emits cooling, cold, and resolved signals", async () => {
  const { moduleExports, cleanupBundle } = await buildModule(
    path.resolve("src/renderer/waiting-reminder-cadence.ts"),
    "waiting-reminder-cadence"
  );

  try {
    const { getWaitingReminderSignal } = moduleExports;
    const baseCard = {
      id: 17,
      createdAt: 1778400000000,
      threadCache: {
        chasing: "Ship the waiting flow",
        workingJudgment: null,
        ruledOut: null,
        nextMove: "先把 B 的验收补完。",
        meanwhile: "先把 B 的验收补完。",
        waitingOn: "A 还在等别人回复",
        waitingResolvedAt: null,
        sideThread: "A 还在等别人回复，回音没来前先别围着它空转。",
        expiresWhen: "when A replies",
      },
    };

    assert.match(
      getWaitingReminderSignal(baseCard, 1778400000000 + 3 * 60 * 60 * 1000).note,
      /等了一阵了/
    );
    assert.match(
      getWaitingReminderSignal(baseCard, 1778400000000 + 30 * 60 * 60 * 1000).note,
      /别再干等了/
    );

    const resolvedSignal = getWaitingReminderSignal({
      ...baseCard,
      threadCache: {
        ...baseCard.threadCache,
        waitingOn: null,
        meanwhile: null,
        waitingResolvedAt: 1778500000123,
      },
    }, 1778500001123);
    assert.match(resolvedSignal.note, /等回来了/);
  } finally {
    await cleanupBundle();
  }
});
