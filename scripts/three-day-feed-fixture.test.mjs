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

const DAY_TEXTS = [
  // Day 1: 15 cards
  [
    "读了 Raft 论文第三版，需要在项目里实现 leader election",
    "和 Alice 对了 Q3 OKR，她提到要优先做性能优化",
    "发现线上有个 N+1 查询的问题，在 users 表关联查询那块",
    "写了一半的 Redis 缓存层设计文档，还需要画架构图",
    "整理了本周 code review 反馈，主要有三类问题要跟进",
    "测试环境部署失败了，看日志是 Docker compose 网络策略的问题",
    "和产品经理聊了新功能的需求，有三个细节还要确认",
    "看了 WebRTC 的入门教程，想做点对点传输",
    "重构了认证中间件，把 JWT 换成了 session-based 的方案",
    "数据库迁移脚本写到一半，加了个复合索引还没测",
    "帮后端同事排查了一个并发写入导致数据不一致的问题",
    "研究了 WebSocket 的心跳机制，准备用在实时通知模块上",
    "写了个 Python 脚本批量处理上周的日志文件",
    "前端表单验证逻辑太散了，想统一抽成一个校验模块",
    "配置了 CI 流水线的缓存策略，构建时间降了接近一半",
  ],
  // Day 2: 12 cards
  [
    "继续看 Raft 论文，log replication 部分还没完全理解",
    "性能优化的第一个目标：P99 延迟从 500ms 降到 200ms",
    "N+1 查询修了，用 DataLoader 批量化了关联查询",
    "Redis 缓存层架构图画完了，准备明天给团队过一下",
    "code review 反馈整理成文档了，发到了团队频道",
    "测试环境的问题定位到了，是网络策略配置写错了",
    "产品需求确认了三个细节，写在 Notion 页面里了",
    "WebRTC demo 跑通了，下一步是集成到现有项目",
    "认证中间件迁移完了，测试覆盖率到了 85%",
    "数据库迁移脚本测试通过，准备这周上线",
    "并发写入的问题确认是乐观锁的版本号没校验到位",
    "WebSocket 心跳实现了，断线重连还没做",
  ],
  // Day 3: 10 cards
  [
    "Raft 论文终于读完了，开始写实现方案的 draft",
    "性能优化第二阶段：加本地缓存，减少 Redis 往返",
    "架构图评审反馈收到了，要加降级方案的说明",
    "WebRTC 集成方案选型：PeerJS vs 原生 API",
    "乐观锁的修复上线了，监控暂时没报警",
    "WebSocket 断线重连用了指数退避策略",
    "新来了个实习生，要准备 onboarding 的技术文档",
    "周末要给技术分享会准备个关于缓存策略的 talk",
    "线上有个新的报警，是定时任务的执行时间超过了阈值",
    "整理了本月的 tech debt 清单，大概有二十项",
  ],
];

const BANNED_WORDS = ["待处理", "未完成", "清理", "过期", "删除"];

test("3-day feed: 37 cards decay to bounded guarded lines on day 4", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-three-day-"));
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
  getHotWorklineCount,
  skipDailyCloseLine,
  takeDailyCloseLineCandidates,
  updateCardLifecycle,
} = require(path.join(repoRoot, "dist-electron/src/main/workline/lifecycle.js"));
const { getAppStatus } = require(path.join(repoRoot, "dist-electron/src/main/status/app-status.js"));

const DAY1 = new Date("2026-05-14T09:00:00+08:00").getTime();
const DAY2 = new Date("2026-05-15T09:00:00+08:00").getTime();
const DAY3 = new Date("2026-05-16T09:00:00+08:00").getTime();
const DAY4 = new Date("2026-05-17T10:00:00+08:00").getTime();
const HOUR = 3600 * 1000;

const DAY_TEXTS = ${JSON.stringify(DAY_TEXTS)};
const BANNED_WORDS = ${JSON.stringify(BANNED_WORDS)};

(async () => {
  runMigrations();
  const db = getDatabase();

  // --- Day 1: Ingest 15 cards, user guards 2 ---
  const day1 = [];
  for (let i = 0; i < DAY_TEXTS[0].length; i++) {
    Date.now = () => DAY1 + i * HOUR;
    day1.push(await ingestChaosReset(DAY_TEXTS[0][i], "real"));
  }
  Date.now = () => DAY1 + 14 * HOUR;
  updateCardLifecycle(day1[0].id, "continue_guarding", Date.now());
  updateCardLifecycle(day1[3].id, "continue_guarding", Date.now() + 1);

  // --- Day 2: Ingest 12, close-line + skip, guard 2, tomorrow 1 ---
  const day2 = [];
  for (let i = 0; i < DAY_TEXTS[1].length; i++) {
    Date.now = () => DAY2 + i * HOUR;
    day2.push(await ingestChaosReset(DAY_TEXTS[1][i], "real"));
  }
  Date.now = () => DAY2;
  const day2Cl = takeDailyCloseLineCandidates(Date.now());
  skipDailyCloseLine(day2Cl.map((c) => c.id), Date.now());

  Date.now = () => DAY2 + 10 * HOUR;
  updateCardLifecycle(day2[1].id, "continue_guarding", Date.now());
  updateCardLifecycle(day2[4].id, "continue_guarding", Date.now() + 1);
  Date.now = () => DAY2 + 11 * HOUR;
  updateCardLifecycle(day2[7].id, "tomorrow", Date.now());

  // --- Day 3: Ingest 10, close-line + skip, guard 2 ---
  const day3 = [];
  for (let i = 0; i < DAY_TEXTS[2].length; i++) {
    Date.now = () => DAY3 + i * HOUR;
    day3.push(await ingestChaosReset(DAY_TEXTS[2][i], "real"));
  }
  Date.now = () => DAY3;
  const day3Cl = takeDailyCloseLineCandidates(Date.now());
  skipDailyCloseLine(day3Cl.map((c) => c.id), Date.now());

  Date.now = () => DAY3 + 8 * HOUR;
  updateCardLifecycle(day3[0].id, "continue_guarding", Date.now());
  updateCardLifecycle(day3[2].id, "continue_guarding", Date.now() + 1);

  // --- Day 4: Assertions ---
  Date.now = () => DAY4;

  const totalCards = db.prepare("SELECT COUNT(*) AS count FROM cards").get().count;
  const hotCount = getHotWorklineCount(null, DAY4);

  const hotPlusWaiting = db.prepare(
    "SELECT COUNT(*) AS count FROM cards" +
    " WHERE lifecycle_status IN ('hot', 'waiting')" +
    " AND (ttl_at IS NULL OR ttl_at >= ?)"
  ).get(DAY4).count;

  const day4Cl = takeDailyCloseLineCandidates(DAY4);
  const day4ClAgain = takeDailyCloseLineCandidates(DAY4);

  const status = await getAppStatus();

  const allTitles = db.prepare("SELECT title FROM cards").all().map((r) => r.title);
  const bannedHits = [];
  for (const title of allTitles) {
    for (const word of BANNED_WORDS) {
      if (title.includes(word)) {
        bannedHits.push({ title, word });
      }
    }
  }

  const allStatuses = db.prepare(
    "SELECT lifecycle_status, COUNT(*) AS count FROM cards GROUP BY lifecycle_status"
  ).all();

  console.log(JSON.stringify({
    totalCards,
    hotCount,
    hotPlusWaiting,
    day4ClCount: day4Cl.length,
    day4ClAgainCount: day4ClAgain.length,
    rememberedThread: status.pet.rememberedThread,
    bannedHits,
    petSummary: status.pet.summary,
    statusCounts: allStatuses,
  }));
  closeDatabase();
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
`;

    const { stdout } = await runElectronProbe(electronScript);
    const result = parseLastJsonLine(stdout);

    // 1. All 37 cards ingested
    assert.equal(result.totalCards, 37, `Expected 37 cards, got ${result.totalCards}`);

    // 2. Hot count bounded by cap
    assert.ok(result.hotCount <= 3, `Hot count ${result.hotCount} exceeds cap of 3`);

    // 3. Hot + waiting with valid TTL bounded
    assert.ok(result.hotPlusWaiting <= 3, `Hot+waiting with valid TTL: ${result.hotPlusWaiting} exceeds 3`);

    // 4. Day 4 close-line shows bounded candidates
    assert.ok(result.day4ClCount <= 5, `Close-line showed ${result.day4ClCount} candidates, expected ≤ 5`);
    assert.ok(result.day4ClCount > 0, "Day 4 close-line should have expired candidates");

    // 5. Close-line fires at most once per day
    assert.equal(result.day4ClAgainCount, 0, "Close-line should not fire twice on the same day");

    // 6. No banned words in card titles
    assert.equal(result.bannedHits.length, 0, `Banned words in titles: ${JSON.stringify(result.bannedHits)}`);

    // 7. Pet summary does not show raw card count as debt
    assert.doesNotMatch(result.petSummary, /\d+ (条|items|cards)/, "Pet summary should not show raw card count");
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
