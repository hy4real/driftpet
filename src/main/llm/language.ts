export type OutputLanguage = "zh" | "en";

const normalizeWhitespace = (value: string): string => {
  return value.trim().replace(/\s+/g, " ");
};

const countMatches = (value: string, pattern: RegExp): number => {
  return (value.match(pattern) ?? []).length;
};

export const detectOutputLanguage = (...values: Array<string | null | undefined>): OutputLanguage => {
  const content = normalizeWhitespace(values.filter((value): value is string => typeof value === "string").join(" "));
  if (content.length === 0) {
    return "en";
  }

  const cjkCount = countMatches(content, /[\u3400-\u9fff]/g);
  const latinCount = countMatches(content, /[A-Za-z]/g);

  if (cjkCount === 0) {
    return "en";
  }

  if (latinCount === 0) {
    return "zh";
  }

  return cjkCount >= Math.max(4, latinCount * 0.35) ? "zh" : "en";
};
