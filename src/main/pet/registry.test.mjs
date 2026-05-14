import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const repoRoot = process.cwd();
const registryModulePath = path.join(
  repoRoot,
  "dist-electron/src/main/pet/registry.js"
);
const require = createRequire(import.meta.url);

const writePet = async ({ rootDir, slug, displayName, spritesheetName }) => {
  const petDir = path.join(rootDir, slug);
  await fs.mkdir(petDir, { recursive: true });
  await fs.writeFile(
    path.join(petDir, "pet.json"),
    JSON.stringify({
      id: slug,
      displayName,
      description: `${displayName} description`,
      spritesheetPath: spritesheetName,
    })
  );
  await fs.writeFile(path.join(petDir, spritesheetName), "fake");
};

test("registry merges driftpet and codex pets and prefers codex duplicates", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-pet-registry-"));
  const driftpetDataDir = path.join(tmpRoot, "driftpet-data");
  const codexHomeDir = path.join(tmpRoot, "codex-home");
  const petdexHomeDir = path.join(tmpRoot, "petdex-home");
  const driftpetPetsDir = path.join(driftpetDataDir, "pets");
  const codexPetsDir = path.join(codexHomeDir, "pets");
  const petdexPetsDir = path.join(petdexHomeDir, "pets");

  process.env.DRIFTPET_DATA_DIR = driftpetDataDir;
  process.env.CODEX_HOME = codexHomeDir;
  process.env.PETDEX_HOME = petdexHomeDir;

  await writePet({
    rootDir: driftpetPetsDir,
    slug: "shared-pet",
    displayName: "Shared Driftpet",
    spritesheetName: "spritesheet.webp",
  });
  await writePet({
    rootDir: codexPetsDir,
    slug: "shared-pet",
    displayName: "Shared Codex",
    spritesheetName: "spritesheet.webp",
  });
  await writePet({
    rootDir: petdexPetsDir,
    slug: "shared-pet",
    displayName: "Shared Petdex",
    spritesheetName: "spritesheet.webp",
  });
  await writePet({
    rootDir: codexPetsDir,
    slug: "codex-only",
    displayName: "Codex Only",
    spritesheetName: "spritesheet.webp",
  });

  const { listInstalledPets, resolvePetAssetPath } = require(registryModulePath);

  try {
    const pets = listInstalledPets();
    const sharedPet = pets.find((pet) => pet.slug === "shared-pet");
    const codexOnlyPet = pets.find((pet) => pet.slug === "codex-only");

    assert.ok(sharedPet);
    assert.equal(sharedPet.displayName, "Shared Petdex");
    assert.equal(sharedPet.source, "petdex");

    assert.ok(codexOnlyPet);
    assert.equal(codexOnlyPet.source, "codex");

    const sharedAsset = resolvePetAssetPath("shared-pet", "spritesheet.webp");
    assert.equal(
      sharedAsset,
      path.join(petdexPetsDir, "shared-pet", "spritesheet.webp")
    );
  } finally {
    delete process.env.DRIFTPET_DATA_DIR;
    delete process.env.CODEX_HOME;
    delete process.env.PETDEX_HOME;
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
