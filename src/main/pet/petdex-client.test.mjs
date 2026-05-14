import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const repoRoot = process.cwd();
const { parsePetdexSlug } = await import(
  path.join(repoRoot, "dist-electron/src/main/pet/petdex-client.js")
);

test("parsePetdexSlug accepts plain slugs", () => {
  assert.equal(parsePetdexSlug("noir-webling"), "noir-webling");
  assert.equal(parsePetdexSlug("Noir-Webling"), "noir-webling");
});

test("parsePetdexSlug accepts petdex pet URLs with or without locale", () => {
  assert.equal(
    parsePetdexSlug("https://petdex.crafter.run/pets/noir-webling"),
    "noir-webling"
  );
  assert.equal(
    parsePetdexSlug("https://petdex.crafter.run/zh/pets/noir-webling"),
    "noir-webling"
  );
  assert.equal(
    parsePetdexSlug("petdex.crafter.run/zh/pets/noir-webling?ref=share"),
    "noir-webling"
  );
});

test("parsePetdexSlug accepts petdex install commands", () => {
  assert.equal(
    parsePetdexSlug("npx petdex install noir-webling"),
    "noir-webling"
  );
  assert.equal(
    parsePetdexSlug("pnpm dlx petdex install Noir-Webling"),
    "noir-webling"
  );
});

test("parsePetdexSlug rejects unrelated input", () => {
  assert.equal(parsePetdexSlug("https://example.com/pets/noir-webling"), null);
  assert.equal(parsePetdexSlug("npx petdex install"), null);
  assert.equal(parsePetdexSlug(""), null);
});
