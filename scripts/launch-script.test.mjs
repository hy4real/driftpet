import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("launcher avoids Accessibility-only AXRaise automation", async () => {
  const launcher = await fs.readFile(path.resolve("scripts/launch.sh"), "utf8");

  assert.doesNotMatch(launcher, /AXRaise/);
  assert.doesNotMatch(launcher, /System Events/);
  assert.match(launcher, /open -n "\$PACKAGED_APP"/);
});
