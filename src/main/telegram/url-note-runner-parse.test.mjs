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
