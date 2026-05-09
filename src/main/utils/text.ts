export const normalizeText = (value: string): string => {
  return value.trim().replace(/\s+/g, " ");
};

export const truncate = (value: string, limit: number): string => {
  const normalized = normalizeText(value);
  return normalized.length > limit ? `${normalized.slice(0, limit - 3)}...` : normalized;
};
