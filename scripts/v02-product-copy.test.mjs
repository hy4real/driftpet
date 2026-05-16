import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("package description frames driftpet as a work-memory guardian, not a fragment collector", async () => {
  const packageJson = JSON.parse(await fs.readFile(path.resolve("package.json"), "utf8"));

  assert.equal(
    packageJson.description,
    "Mac 工作记忆守护型桌宠，帮你守住、衰减并放下还没来得及沉淀的工作线。"
  );
  assert.doesNotMatch(packageJson.description, /可爱桌面陪伴宠|碎片信息|小纸条/);
});
