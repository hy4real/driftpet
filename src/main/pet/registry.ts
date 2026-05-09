import fs from "node:fs";
import path from "node:path";
import { getDataDir, getAssetsDir } from "../paths";
import { getPref, setPref } from "../db/prefs";

const ACTIVE_PET_PREF = "active_pet_slug";
const BOBA_SLUG = "boba";

export type PetInfo = {
  slug: string;
  displayName: string;
  isBuiltin: boolean;
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
): { displayName: string } | null => {
  const jsonPath = path.join(petDir, "pet.json");
  if (!fs.existsSync(jsonPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(jsonPath, "utf-8");
    return JSON.parse(raw) as { displayName: string };
  } catch {
    return null;
  }
};

export const listInstalledPets = (): PetInfo[] => {
  const pets: PetInfo[] = [
    { slug: BOBA_SLUG, displayName: "Boba", isBuiltin: true },
  ];

  const petsDir = getPetsDir();
  if (!fs.existsSync(petsDir)) {
    return pets;
  }

  const entries = fs.readdirSync(petsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === BOBA_SLUG) {
      continue;
    }

    const petDir = path.join(petsDir, entry.name);
    const petJson = readPetJson(petDir);
    if (petJson === null) {
      continue;
    }

    pets.push({
      slug: entry.name,
      displayName: petJson.displayName ?? entry.name,
      isBuiltin: false,
    });
  }

  return pets;
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
} => {
  const slug = getActivePetSlug();

  if (slug === BOBA_SLUG) {
    const builtinPath = getBuiltinSpritesheetPath();
    const ext = builtinPath.endsWith(".png") ? ".png" : ".webp";
    return { slug, spritesheetPath: builtinPath, spritesheetExt: ext };
  }

  const petDir = path.join(getPetsDir(), slug);
  if (!fs.existsSync(petDir)) {
    // Fallback to boba if the installed pet is missing.
    const builtinPath = getBuiltinSpritesheetPath();
    const ext = builtinPath.endsWith(".png") ? ".png" : ".webp";
    setActivePetSlug(BOBA_SLUG);
    return { slug: BOBA_SLUG, spritesheetPath: builtinPath, spritesheetExt: ext };
  }

  // Detect spritesheet extension.
  const webpPath = path.join(petDir, "spritesheet.webp");
  const pngPath = path.join(petDir, "spritesheet.png");
  if (fs.existsSync(webpPath)) {
    return { slug, spritesheetPath: webpPath, spritesheetExt: ".webp" };
  }
  if (fs.existsSync(pngPath)) {
    return { slug, spritesheetPath: pngPath, spritesheetExt: ".png" };
  }

  // No spritesheet found — fallback to boba.
  const builtinPath = getBuiltinSpritesheetPath();
  const ext = builtinPath.endsWith(".png") ? ".png" : ".webp";
  setActivePetSlug(BOBA_SLUG);
  return { slug: BOBA_SLUG, spritesheetPath: builtinPath, spritesheetExt: ext };
};
