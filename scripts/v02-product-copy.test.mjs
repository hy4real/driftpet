import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  EXCEPTION_MARKER,
  V02_BANNED_WORDS,
  V02_FIRST_CLASS_UI_FILES,
  formatBannedHits,
  scanForBannedWords,
} from "./v02-banned-words.mjs";

test("package description frames driftpet as a work-memory guardian, not a fragment collector", async () => {
  const packageJson = JSON.parse(await fs.readFile(path.resolve("package.json"), "utf8"));

  assert.equal(
    packageJson.description,
    "Mac 工作记忆守护型桌宠，帮你守住、衰减并放下还没来得及沉淀的工作线。"
  );
  assert.doesNotMatch(packageJson.description, /可爱桌面陪伴宠|碎片信息|小纸条/);
});

test("v0.2 first-class UI surfaces avoid debt-flavored wording", async () => {
  const hits = await scanForBannedWords(V02_FIRST_CLASS_UI_FILES, V02_BANNED_WORDS);

  assert.equal(
    hits.length,
    0,
    `Found ${hits.length} banned-word hit(s) in v0.2 UI surfaces. ` +
      `Each violation must either use one of the four lifecycle verbs ` +
      `(继续守着/明天接/沉淀/放下) or carry an explicit "${EXCEPTION_MARKER}" ` +
      `marker on the same line or the line above:\n${formatBannedHits(hits)}`
  );
});

test("banned-word scanner catches an unmarked violation", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-v02-copy-"));
  try {
    const tmpFile = path.join(tmpDir, "fake-surface.tsx");
    await fs.writeFile(
      tmpFile,
      'export const Caption = () => "你还有 3 条待处理";\n',
      "utf8"
    );

    const hits = await scanForBannedWords([tmpFile], ["待处理"]);

    assert.equal(hits.length, 1);
    assert.equal(hits[0].word, "待处理");
    assert.equal(hits[0].line, 1);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("banned-word scanner respects inline and prior-line exception markers", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-v02-copy-"));
  try {
    const tmpFile = path.join(tmpDir, "fake-surface.tsx");
    await fs.writeFile(
      tmpFile,
      [
        'export const Inline = () => "彻底删除"; // v02-copy:allow-banned',
        '// v02-copy:allow-banned',
        'export const PriorLine = () => "彻底删除";',
        'export const Unmarked = () => "彻底删除";',
        ''
      ].join("\n"),
      "utf8"
    );

    const hits = await scanForBannedWords([tmpFile], ["删除"]);

    assert.equal(hits.length, 1, "only the unmarked violation should be reported");
    assert.equal(hits[0].line, 4);
    assert.equal(hits[0].word, "删除");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
