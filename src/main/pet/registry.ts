import fs from "node:fs";
import path from "node:path";
import { getDataDir, getAssetsDir, getCodexPetsDir, getPetdexPetsDir } from "../paths";
import { getPref, setPref } from "../db/prefs";

const ACTIVE_PET_PREF = "active_pet_slug";
const BOBA_SLUG = "boba";

export type PetSource = "builtin" | "driftpet" | "codex" | "petdex";

export type PetInfo = {
  slug: string;
  displayName: string;
  isBuiltin: boolean;
  source: PetSource;
};

type PetManifest = {
  id?: string;
  displayName?: string;
  description?: string;
  spritesheetPath?: string;
};

type PetRecord = {
  slug: string;
  displayName: string;
  isBuiltin: boolean;
  source: PetSource;
  petDir: string | null;
  spritesheetPath: string;
  spritesheetAssetPath: string;
};

const getBuiltinSpritesheetPath = (): string => {
  const assetsDir = getAssetsDir();
  const candidates = [
    path.join(assetsDir, "boba-spritesheet.webp"),
    path.join(assetsDir, "boba-spritesheet.png"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  // Fallback: resolve from the renderer assets at dev time.
  return path.resolve(__dirname, "../../src/renderer/assets/boba-spritesheet.webp");
};

const getPetsDir = (): string => {
  return path.join(getDataDir(), "pets");
};

const readPetJson = (
  petDir: string
): PetManifest | null => {
  const jsonPath = path.join(petDir, "pet.json");
  if (!fs.existsSync(jsonPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(jsonPath, "utf-8");
    return JSON.parse(raw) as PetManifest;
  } catch {
    return null;
  }
};

const normalizeAssetPath = (input: string): string | null => {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.length === 0 || normalized.includes("..")) {
    return null;
  }

  return normalized;
};

const resolvePetFile = (
  petDir: string,
  assetPath: string
): string | null => {
  const resolved = path.resolve(petDir, assetPath);
  const relative = path.relative(petDir, resolved);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !fs.existsSync(resolved)
  ) {
    return null;
  }

  return resolved;
};

const resolvePetSpritesheet = (
  petDir: string,
  petJson: PetManifest
): { spritesheetPath: string; spritesheetAssetPath: string } | null => {
  const candidateAssetPaths = [
    petJson.spritesheetPath,
    "spritesheet.webp",
    "spritesheet.png",
  ];

  for (const candidate of candidateAssetPaths) {
    if (typeof candidate !== "string") {
      continue;
    }

    const assetPath = normalizeAssetPath(candidate);
    if (assetPath === null) {
      continue;
    }

    const resolved = resolvePetFile(petDir, assetPath);
    if (resolved !== null) {
      return {
        spritesheetPath: resolved,
        spritesheetAssetPath: assetPath,
      };
    }
  }

  return null;
};

const getBuiltinPet = (): PetRecord => {
  const spritesheetPath = getBuiltinSpritesheetPath();
  return {
    slug: BOBA_SLUG,
    displayName: "Boba",
    isBuiltin: true,
    source: "builtin",
    petDir: null,
    spritesheetPath,
    spritesheetAssetPath: path.basename(spritesheetPath),
  };
};

const readPetRecord = (
  petDir: string,
  slug: string,
  source: PetSource
): PetRecord | null => {
  const petJson = readPetJson(petDir);
  if (petJson === null) {
    return null;
  }

  const spritesheet = resolvePetSpritesheet(petDir, petJson);
  if (spritesheet === null) {
    return null;
  }

  return {
    slug,
    displayName: petJson.displayName ?? slug,
    isBuiltin: false,
    source,
    petDir,
    spritesheetPath: spritesheet.spritesheetPath,
    spritesheetAssetPath: spritesheet.spritesheetAssetPath,
  };
};

const collectPetsFromDir = (
  petsDir: string,
  source: PetSource
): PetRecord[] => {
  if (!fs.existsSync(petsDir)) {
    return [];
  }

  const pets: PetRecord[] = [];
  const entries = fs.readdirSync(petsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === BOBA_SLUG) {
      continue;
    }

    const petDir = path.join(petsDir, entry.name);
    const pet = readPetRecord(petDir, entry.name, source);
    if (pet !== null) {
      pets.push(pet);
    }
  }

  return pets;
};

const petSourcePriority = (source: PetSource): number => {
  if (source === "builtin") {
    return 0;
  }
  if (source === "driftpet") {
    return 1;
  }
  if (source === "codex") {
    return 2;
  }
  return 3;
};

const listPetRecords = (): PetRecord[] => {
  const merged = new Map<string, PetRecord>();
  const register = (pet: PetRecord) => {
    const current = merged.get(pet.slug);
    if (
      current === undefined ||
      petSourcePriority(pet.source) >= petSourcePriority(current.source)
    ) {
      merged.set(pet.slug, pet);
    }
  };

  register(getBuiltinPet());
  for (const pet of collectPetsFromDir(getPetsDir(), "driftpet")) {
    register(pet);
  }
  for (const pet of collectPetsFromDir(getCodexPetsDir(), "codex")) {
    register(pet);
  }
  for (const pet of collectPetsFromDir(getPetdexPetsDir(), "petdex")) {
    register(pet);
  }

  return Array.from(merged.values()).sort((left, right) => {
    if (left.isBuiltin !== right.isBuiltin) {
      return left.isBuiltin ? -1 : 1;
    }

    return left.displayName.localeCompare(right.displayName, "en", {
      sensitivity: "base",
    });
  });
};

const findPetRecord = (slug: string): PetRecord | null => {
  return listPetRecords().find((pet) => pet.slug === slug) ?? null;
};

export const listInstalledPets = (): PetInfo[] => {
  return listPetRecords().map((pet) => ({
    slug: pet.slug,
    displayName: pet.displayName,
    isBuiltin: pet.isBuiltin,
    source: pet.source,
  }));
};

export const getActivePetSlug = (): string => {
  return getPref(ACTIVE_PET_PREF) ?? BOBA_SLUG;
};

export const setActivePetSlug = (slug: string): void => {
  setPref(ACTIVE_PET_PREF, slug);
};

export const getActivePetAssets = (): {
  slug: string;
  spritesheetPath: string;
  spritesheetExt: string;
  spritesheetAssetPath: string;
} => {
  const slug = getActivePetSlug();
  const pet = findPetRecord(slug) ?? getBuiltinPet();
  if (pet.slug !== slug) {
    setActivePetSlug(pet.slug);
  }

  const ext = pet.spritesheetPath.endsWith(".png") ? ".png" : ".webp";
  return {
    slug: pet.slug,
    spritesheetPath: pet.spritesheetPath,
    spritesheetExt: ext,
    spritesheetAssetPath: pet.spritesheetAssetPath,
  };
};

export const resolvePetAssetPath = (
  slug: string,
  assetPath: string
): string | null => {
  const pet = findPetRecord(slug);
  if (pet === null) {
    return null;
  }

  const normalizedAssetPath = normalizeAssetPath(assetPath);
  if (normalizedAssetPath === null) {
    return null;
  }

  if (normalizedAssetPath === pet.spritesheetAssetPath) {
    return pet.spritesheetPath;
  }

  if (pet.petDir === null) {
    return resolvePetFile(getAssetsDir(), normalizedAssetPath);
  }

  return resolvePetFile(pet.petDir, normalizedAssetPath);
};
