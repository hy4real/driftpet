export type UrlNoteKind = "video" | "article" | "unknown";

const VIDEO_HOST_PATTERNS = [
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)bilibili\.com$/i,
  /(^|\.)b23\.tv$/i
];

export const classifyUrlNoteKind = (value: string): UrlNoteKind => {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    if (VIDEO_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
      return "video";
    }

    if (url.protocol === "http:" || url.protocol === "https:") {
      return "article";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
};
