import test from "node:test";
import assert from "node:assert/strict";
const VAULT_DIR = "/Users/mac/my-obsidian-vault";

const normalizeArtifactPath = (raw) => (
  raw.startsWith("/") ? raw : `${VAULT_DIR}/${raw}`
);

const inferArtifactPath = (output) => {
  const candidates = Array.from(output.matchAll(/(?:\/Users\/mac\/my-obsidian-vault\/|AI\/)[^\n]*?\.md\b/g))
    .map((match) => match[0].trim())
    .map((value) => normalizeArtifactPath(value.replace(/^"+|"+$/g, "")))
    .filter((candidate, index, all) => all.indexOf(candidate) === index);
  return candidates.at(0) ?? null;
};

const isBilibiliHost = (value) => {
  try {
    const hostname = new URL(value).hostname;
    return /(^|\.)bilibili\.com$/i.test(hostname) || /(^|\.)b23\.tv$/i.test(hostname);
  } catch {
    return false;
  }
};

const resolveVideoOutputDir = (url) => {
  const platform = isBilibiliHost(url) ? "bilibili" : "youtube";
  return `${VAULT_DIR}/${platform === "bilibili" ? "AI/Bilibili" : "AI/YouTube"}`;
};

const parseArtifactPath = (output) => {
  const match = output.match(/ARTIFACT:\s*(.+)\s*$/m);
  if (match === null) {
    return inferArtifactPath(output);
  }

  const raw = match[1].trim();
  if (raw.length === 0 || raw.toLowerCase() === "unsupported") {
    return null;
  }

  return normalizeArtifactPath(raw);
};

test("parseArtifactPath resolves absolute path", () => {
  assert.equal(parseArtifactPath("ARTIFACT: /tmp/note.md"), "/tmp/note.md");
});

test("parseArtifactPath resolves vault-relative path", () => {
  assert.equal(parseArtifactPath("ARTIFACT: AI/Articles/foo.md"), "/Users/mac/my-obsidian-vault/AI/Articles/foo.md");
});

test("parseArtifactPath returns null when artifact line missing", () => {
  assert.equal(parseArtifactPath("done"), null);
});

test("parseArtifactPath infers vault file from plain output", () => {
  assert.equal(
    parseArtifactPath("写好了：AI/Bilibili/artifact-infer-test.md"),
    "/Users/mac/my-obsidian-vault/AI/Bilibili/artifact-infer-test.md"
  );
});

test("resolveVideoOutputDir keeps bilibili.com under AI/Bilibili", () => {
  assert.equal(
    resolveVideoOutputDir("https://www.bilibili.com/video/BV1mxR9BiEm8/?share_source=copy_web"),
    "/Users/mac/my-obsidian-vault/AI/Bilibili"
  );
});

test("resolveVideoOutputDir keeps b23 shortlinks under AI/Bilibili", () => {
  assert.equal(
    resolveVideoOutputDir("https://b23.tv/Cmz4QJI"),
    "/Users/mac/my-obsidian-vault/AI/Bilibili"
  );
});
