import fs from "node:fs";
import path from "node:path";
import { getPromptsDir } from "../paths";

const promptCache = new Map<string, string>();

export const loadPrompt = (fileName: string): string => {
  const cached = promptCache.get(fileName);
  if (cached !== undefined) {
    return cached;
  }

  const fullPath = path.join(getPromptsDir(), fileName);
  const content = fs.readFileSync(fullPath, "utf8");
  promptCache.set(fileName, content);
  return content;
};
