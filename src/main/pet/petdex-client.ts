import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "../paths";

const MANIFEST_URL = "https://petdex.crafter.run/api/manifest";
const CACHE_TTL_MS = 5 * 60 * 1000;

type ManifestEntry = {
  slug: string;
  displayName: string;
  petJsonUrl: string;
  spritesheetUrl: string;
};

type PetdexManifest = {
  pets: ManifestEntry[];
};

type CachedManifest = {
  data: PetdexManifest;
  fetchedAt: number;
};

let manifestCache: CachedManifest | null = null;

export const parsePetdexSlug = (input: string): string | null => {
  const trimmed = input.trim();

  // Full URL: https://petdex.crafter.run/zh/pets/boba
  const urlMatch = trimmed.match(
    /petdex\.crafter\.run\/[^/]*\/pets\/([a-z0-9_-]+)/i
  );
  if (urlMatch !== null) {
    return urlMatch[1].toLowerCase();
  }

  // Plain slug: boba, kurisu, etc.
  const slugMatch = trimmed.match(/^([a-z0-9_-]+)$/i);
  if (slugMatch !== null) {
    return slugMatch[1].toLowerCase();
  }

  return null;
};

export const fetchManifest = async (): Promise<PetdexManifest> => {
  if (
    manifestCache !== null &&
    Date.now() - manifestCache.fetchedAt < CACHE_TTL_MS
  ) {
    return manifestCache.data;
  }

  const response = await fetch(MANIFEST_URL);
  if (!response.ok) {
    throw new Error(
      `petdex manifest fetch failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as PetdexManifest;
  manifestCache = { data, fetchedAt: Date.now() };
  return data;
};

export const downloadPet = async (
  slug: string
): Promise<{ slug: string; dir: string; spritesheetExt: string }> => {
  const manifest = await fetchManifest();
  const entry = manifest.pets.find(
    (pet) => pet.slug.toLowerCase() === slug.toLowerCase()
  );

  if (entry === undefined) {
    throw new Error(`pet not found in manifest: ${slug}`);
  }

  const petDir = path.join(getDataDir(), "pets", slug);
  fs.mkdirSync(petDir, { recursive: true });

  const [petJsonResponse, spritesheetResponse] = await Promise.all([
    fetch(entry.petJsonUrl),
    fetch(entry.spritesheetUrl),
  ]);

  if (!petJsonResponse.ok) {
    throw new Error(
      `failed to download pet.json for ${slug}: ${petJsonResponse.status}`
    );
  }
  if (!spritesheetResponse.ok) {
    throw new Error(
      `failed to download spritesheet for ${slug}: ${spritesheetResponse.status}`
    );
  }

  const petJsonBuffer = Buffer.from(await petJsonResponse.arrayBuffer());
  fs.writeFileSync(path.join(petDir, "pet.json"), petJsonBuffer);

  const spritesheetUrl = entry.spritesheetUrl;
  const spritesheetExt = spritesheetUrl.endsWith(".png") ? ".png" : ".webp";
  const spritesheetBuffer = Buffer.from(
    await spritesheetResponse.arrayBuffer()
  );
  fs.writeFileSync(
    path.join(petDir, `spritesheet${spritesheetExt}`),
    spritesheetBuffer
  );

  return { slug, dir: petDir, spritesheetExt };
};
