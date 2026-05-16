import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const localTempRoot = path.resolve(".tmp");
const digestEntry = path.resolve("src/main/llm/digest-card.ts");

const buildDigestModule = async () => {
  await fs.mkdir(localTempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(localTempRoot, "driftpet-digest-card-"));
  const outfile = path.join(tempDir, "digest-card.cjs");

  await build({
    entryPoints: [digestEntry],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile,
    loader: {
      ".ts": "ts",
    },
    external: ["better-sqlite3"],
  });

  const moduleExports = require(outfile);
  return {
    generateDigestDraft: moduleExports.generateDigestDraft,
    cleanupBundle: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
};

const LLM_ENV_KEYS = [
  "DRIFTPET_LLM_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
];

const withNoLlmDigest = async (callback) => {
  const { generateDigestDraft, cleanupBundle } = await buildDigestModule();
  const previousEnv = new Map(LLM_ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of LLM_ENV_KEYS) {
    delete process.env[key];
  }

  try {
    return await callback(generateDigestDraft);
  } finally {
    await cleanupBundle();
    for (const [key, value] of previousEnv.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

test("manual chaos fallback uses a concrete first action instead of meta deliverable wording", async () => {
  await withNoLlmDigest(async (generateDigestDraft) => {
    const result = await generateDigestDraft(
      {
        source: "manual_chaos",
        rawText: "Need to finish the launch checklist, but I keep drifting into CSS polish, extra tabs, and unrelated refactor notes.",
      },
      []
    );

    assert.match(result.digest.useFor, /^Set aside: /);
    assert.match(result.digest.useFor, /Next: Close two unrelated tabs, let driftpet guard/);
    assert.doesNotMatch(result.digest.useFor, /smallest deliverable/i);
    assert.match(result.digest.knowledgeTag, /thread cache/i);
    assert.match(result.digest.summaryForRetrieval, /Working-memory cache/);
    assert.equal(result.digest.threadCache.chasing, "Need to finish the launch checklist");
    assert.match(result.digest.threadCache.nextMove, /Close two unrelated tabs/);
    assert.match(result.digest.threadCache.sideThread ?? "", /extra links|anything that does not move|working-memory thread/i);
  });
});

test("telegram drift fallback turns tab spiral into a concrete reset action", async () => {
  await withNoLlmDigest(async (generateDigestDraft) => {
    const result = await generateDigestDraft(
      {
        source: "tg_text",
        rawText: "I am spiraling into tabs again",
      },
      []
    );

    assert.equal(result.digest.title, "Tab drift reset");
    assert.notEqual(result.digest.knowledgeTag.toLowerCase(), "captured note");
    assert.match(result.digest.useFor, /Close two unrelated tabs/);
    assert.match(result.digest.useFor, /let driftpet guard/);
    assert.match(result.digest.useFor, /work on it for five minutes now/);
    assert.doesNotMatch(result.digest.useFor, /Turn this into one next action/i);
    assert.equal(result.digest.threadCache.chasing, "Tab drift reset");
    assert.match(result.digest.threadCache.nextMove, /Close two unrelated tabs/);
  });
});

test("manual chaos fallback names declared thread when recovering from tab drift", async () => {
  await withNoLlmDigest(async (generateDigestDraft) => {
    const result = await generateDigestDraft(
      {
        source: "manual_chaos",
        rawText: "I opened too many tabs and lost the thread. The next useful move is to pick one branch and close the rest.",
      },
      []
    );

    assert.match(result.digest.title, /pick one branch and close the rest/i);
    assert.match(result.digest.useFor, /^Set aside: /);
    assert.match(result.digest.useFor, /pick one branch and close the rest/i);
    assert.doesNotMatch(result.digest.useFor, /Close two unrelated tabs/);
    assert.doesNotMatch(result.digest.useFor, /Turn this into one next action/i);
    assert.match(result.digest.threadCache.chasing, /pick one branch and close the rest/i);
    assert.match(result.digest.threadCache.nextMove, /pick one branch and close the rest/i);
    assert.doesNotMatch(result.digest.threadCache.nextMove, /^to /i);
  });
});

test("manual chaos fallback preserves explicit next move in thread cache", async () => {
  await withNoLlmDigest(async (generateDigestDraft) => {
    const result = await generateDigestDraft(
      {
        source: "manual_chaos",
        rawText: "主线是验证 Thread Cache v1 是否真的守住工作记忆。我怀疑问题不是 URL extraction，而是 nextMove 太像摘要。别再扩展到桌面 app 识别，先跑三条真实样本，标出哪一格丢了。",
      },
      []
    );

    assert.match(result.digest.threadCache.chasing, /验证 Thread Cache v1/);
    assert.match(result.digest.threadCache.workingJudgment ?? "", /不是 URL extraction/);
    assert.match(result.digest.threadCache.ruledOut ?? "", /不是 URL extraction/);
    assert.match(result.digest.threadCache.nextMove, /跑三条真实样本/);
    assert.doesNotMatch(result.digest.threadCache.nextMove, /关掉两个无关标签页/);
  });
});

test("telegram text fallback frames high-signal notes as guarded working memory", async () => {
  await withNoLlmDigest(async (generateDigestDraft) => {
    const result = await generateDigestDraft(
      {
        source: "tg_text",
        rawText: "I suspect the issue is not URL extraction but recall dedupe around MDN locale variants. Next step is to run two locale URLs through the poller path.",
      },
      []
    );

    assert.match(result.digest.useFor, /Let driftpet guard/);
    assert.match(result.digest.summaryForRetrieval, /Working-memory cache/);
    assert.match(result.digest.summaryForRetrieval, /guarded thread/i);
    assert.doesNotMatch(result.digest.knowledgeTag.toLowerCase(), /captured note/);
    assert.match(result.digest.threadCache.workingJudgment ?? "", /not URL extraction/i);
    assert.match(result.digest.threadCache.ruledOut ?? "", /not URL extraction/i);
    assert.match(result.digest.threadCache.nextMove, /run two locale URLs/i);
  });
});

test("telegram text fallback keeps first-action clause over reference caveat", async () => {
  await withNoLlmDigest(async (generateDigestDraft) => {
    const result = await generateDigestDraft(
      {
        source: "tg_text",
        rawText: "Use the article only as reference. Tighten the current driftpet text card first, and do not expand into a broader redesign tonight.",
      },
      []
    );

    assert.match(result.digest.title, /Tighten the current driftpet text card/i);
    assert.equal(result.digest.knowledgeTag, "Tighten the current driftpet");
    assert.match(result.digest.threadCache.chasing, /Tighten the current driftpet text card/i);
    assert.equal(result.digest.threadCache.nextMove, "Tighten the current driftpet text card");
    assert.doesNotMatch(result.digest.threadCache.nextMove, /^,/);
    assert.doesNotMatch(result.digest.threadCache.nextMove, /broader redesign/i);
  });
});

test("manual chaos fallback preserves what to do first and what to set aside", async () => {
  await withNoLlmDigest(async (generateDigestDraft) => {
    const result = await generateDigestDraft(
      {
        source: "manual_chaos",
        rawText: "我已经看到一条真实消息能帮我判断该先做什么、先放下什么。先把这条命中的判断固化成回归样本，别急着再扩展新入口或新提醒方式。",
      },
      []
    );

    assert.match(result.digest.threadCache.chasing, /判断该先做什么、先放下什么/);
    assert.match(result.digest.threadCache.nextMove, /固化成回归样本/);
    assert.match(result.digest.threadCache.ruledOut ?? "", /别急着再扩展新入口或新提醒方式/);
    assert.doesNotMatch(result.digest.threadCache.nextMove, /扩展新入口|新提醒方式/);
  });
});

test("manual chaos fallback keeps an active move when another branch is waiting", async () => {
  await withNoLlmDigest(async (generateDigestDraft) => {
    const result = await generateDigestDraft(
      {
        source: "manual_chaos",
        rawText: "A 还在等别人回复，这会儿先把 B 的验收补完。别围着 A 干等，也别再开新分支。",
      },
      []
    );

    assert.match(result.digest.threadCache.nextMove, /把 B 的验收补完/);
    assert.match(result.digest.threadCache.meanwhile ?? "", /把 B 的验收补完/);
    assert.doesNotMatch(result.digest.threadCache.nextMove, /^等|等待/);
    assert.match(result.digest.threadCache.waitingOn ?? "", /A 还在等别人回复|等别人回复/);
    assert.match(result.digest.threadCache.sideThread ?? "", /等别人回复|干等/);
    assert.match(result.digest.threadCache.ruledOut ?? "", /别再开新分支/);
  });
});

test("manual chaos fallback keeps ruled-out prompt work separate from scoring next move", async () => {
  await withNoLlmDigest(async (generateDigestDraft) => {
    const result = await generateDigestDraft(
      {
        source: "manual_chaos",
        rawText: "我怀疑不是 URL 抽取失败，是 recall 去噪没压住；别再改 prompt，下一步看 scoring。",
      },
      []
    );

    assert.match(result.digest.threadCache.chasing, /URL 抽取失败|recall 去噪|scoring/);
    assert.match(result.digest.threadCache.workingJudgment ?? "", /不是 URL 抽取失败/);
    assert.match(result.digest.threadCache.ruledOut ?? "", /别再改 prompt|不是 URL 抽取失败/);
    assert.match(result.digest.threadCache.nextMove, /看 scoring/);
    assert.doesNotMatch(result.digest.threadCache.nextMove, /改 prompt|URL 抽取失败/);
  });
});

test("manual chaos fallback uses declared Chinese thread instead of generic tab drift reset", async () => {
  await withNoLlmDigest(async (generateDigestDraft) => {
    const result = await generateDigestDraft(
      {
        source: "manual_chaos",
        rawText: "开了太多标签页，丢线了，先回到交付这个设置页。",
      },
      []
    );

    assert.match(result.digest.title, /交付这个设置页/);
    assert.doesNotMatch(result.digest.title, /标签页漂移复位|回到当前主线/);
    assert.match(result.digest.threadCache.chasing, /交付这个设置页/);
    assert.match(result.digest.threadCache.nextMove, /交付这个设置页/);
  });
});

test("telegram low-signal ping skips guarded thread recall", async () => {
  await withNoLlmDigest(async (generateDigestDraft) => {
    const result = await generateDigestDraft(
      {
        source: "tg_text",
        rawText: "哈哈",
      },
      []
    );

    assert.equal(result.mode, "skip_recall");
    assert.equal(result.digest.knowledgeTag, "Telegram ping");
    assert.equal(result.digest.threadCache, null);
    assert.match(result.digest.summaryForRetrieval, /低信号 Telegram ping/);
  });
});

test("telegram real work note keeps action and ruled-out layout branch", async () => {
  await withNoLlmDigest(async (generateDigestDraft) => {
    const result = await generateDigestDraft(
      {
        source: "tg_text",
        rawText: "今晚先把 onboarding 里的权限弹窗文案收掉，别再改布局。",
      },
      []
    );

    assert.equal(result.mode, "full");
    assert.notEqual(result.digest.threadCache, null);
    assert.match(result.digest.threadCache.chasing, /权限弹窗文案/);
    assert.match(result.digest.threadCache.nextMove, /权限弹窗文案收掉/);
    assert.match(result.digest.threadCache.ruledOut ?? "", /别再改布局/);
    assert.doesNotMatch(result.digest.threadCache.nextMove, /改布局|新分支/);
    assert.notEqual(result.digest.knowledgeTag, "Telegram ping");
  });
});

test("waiting fallback recognizes common Chinese waiting variants", async () => {
  await withNoLlmDigest(async (generateDigestDraft) => {
    const cases = [
      {
        rawText: "等客户拍板，这会儿先把发布说明收掉。不要干等。",
        waiting: /等客户拍板/,
        nextMove: /发布说明收掉/,
      },
      {
        rawText: "等 CI 跑完，现在先整理失败截图。",
        waiting: /等 CI 跑完/,
        nextMove: /整理失败截图/,
      },
      {
        rawText: "卡在 QA 等确认，同时先把复现步骤写完。",
        waiting: /卡在 QA 等确认/,
        nextMove: /复现步骤写完/,
      },
    ];

    for (const item of cases) {
      const result = await generateDigestDraft(
        {
          source: "manual_chaos",
          rawText: item.rawText,
        },
        []
      );

      assert.match(result.digest.threadCache.waitingOn ?? "", item.waiting);
      assert.match(result.digest.threadCache.meanwhile ?? "", item.nextMove);
      assert.match(result.digest.threadCache.nextMove, item.nextMove);
      assert.doesNotMatch(result.digest.threadCache.nextMove, /^等|等待|卡在/);
    }
  });
});

test("url failure fallback is a retry shell instead of a guarded work thread", async () => {
  await withNoLlmDigest(async (generateDigestDraft) => {
    const result = await generateDigestDraft(
      {
        source: "tg_url",
        rawText: "这个链接好像有用",
        rawUrl: "https://example.com/private/article",
        extractionStage: "fetch_failed",
        extractionError: "fetch failed: 403",
      },
      []
    );

    assert.equal(result.mode, "skip_recall");
    assert.equal(result.digest.knowledgeTag, "链接待重试");
    assert.equal(result.digest.threadCache, null);
    assert.match(result.digest.title, /链接暂未抓取成功/);
    assert.match(result.digest.useFor, /没有拿到可读正文|手动打开链接/);
  });
});

test("readable url fallback treats article as on-demand reference", async () => {
  await withNoLlmDigest(async (generateDigestDraft) => {
    const result = await generateDigestDraft(
      {
        source: "tg_url",
        rawText: "这个可以当参考",
        rawUrl: "https://example.com/docs/permissions",
        extractedTitle: "macOS 辅助功能权限说明",
        extractedText: "这篇文章解释 macOS Accessibility 权限为什么会反复弹窗，以及如何检查应用签名、bundle id 和 TCC 记录是否一致。",
        extractionStage: "readable",
      },
      []
    );

    assert.equal(result.mode, "full");
    assert.equal(result.digest.knowledgeTag, "捕获文章");
    assert.notEqual(result.digest.threadCache, null);
    assert.match(result.digest.useFor, /按需参考/);
    assert.match(result.digest.threadCache.nextMove, /按需参考|不要现在整篇消化/);
    assert.match(result.digest.threadCache.sideThread ?? "", /不要把整篇文章变成新任务/);
    assert.doesNotMatch(result.digest.useFor, /通读|完整阅读|总结整篇/);
  });
});
