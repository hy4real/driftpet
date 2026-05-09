import test from "node:test";
import assert from "node:assert/strict";

import { parseUseFor } from "./parse-use-for.ts";

test("parseUseFor splits Chinese set-aside / next-step pairs", () => {
  const result = parseUseFor("先放下：先忽略相关企业、付费标签和继续刷更多题的分支。\n下一步：写出一遍遍历 nums 时用哈希表查找 target - nums[i] 的代码。");
  assert.equal(result.setAside, "先忽略相关企业、付费标签和继续刷更多题的分支。");
  assert.equal(result.nextStep, "写出一遍遍历 nums 时用哈希表查找 target - nums[i] 的代码。");
});

test("parseUseFor splits English Set-aside / Next pairs", () => {
  const result = parseUseFor("Set aside: Ignore the LeetCode attribution details and avoid jumping to more problems for now.\nNext: Write the loop that converts each string to a char array.");
  assert.equal(result.setAside, "Ignore the LeetCode attribution details and avoid jumping to more problems for now.");
  assert.equal(result.nextStep, "Write the loop that converts each string to a char array.");
});

test("parseUseFor returns nextStep only when no set-aside tag is present", () => {
  const result = parseUseFor("下一步：先把这一行写出来。");
  assert.equal(result.setAside, null);
  assert.equal(result.nextStep, "先把这一行写出来。");
});

test("parseUseFor falls back to treating untagged text as next step", () => {
  const result = parseUseFor("随便写一段没有标签的文本。");
  assert.equal(result.setAside, null);
  assert.equal(result.nextStep, "随便写一段没有标签的文本。");
});

test("parseUseFor returns empty result for empty input", () => {
  const result = parseUseFor("");
  assert.equal(result.setAside, null);
  assert.equal(result.nextStep, "");
});

test("parseUseFor joins multi-line next step into one string", () => {
  const result = parseUseFor("下一步：先做 A\n再做 B");
  assert.equal(result.setAside, null);
  assert.equal(result.nextStep, "先做 A 再做 B");
});

test("parseUseFor joins multi-line set-aside into one string", () => {
  const result = parseUseFor("Set aside: thing one\nthing two\nNext: focus");
  assert.equal(result.setAside, "thing one thing two");
  assert.equal(result.nextStep, "focus");
});
