import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export type ExtractedArticle = {
  title: string | null;
  text: string | null;
  error: string | null;
  url: string;
};

const normalizeText = (value: string): string => {
  return value.trim().replace(/\s+/g, " ");
};

const bodyTextFallback = (document: JSDOM["window"]["document"]): string | null => {
  const text = normalizeText(document.body?.textContent ?? "");
  return text.length > 0 ? text : null;
};

export const extractArticleFromHtml = (html: string, url: string): ExtractedArticle => {
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;

  try {
    const parsed = new Readability(document).parse();
    const title = normalizeText(parsed?.title ?? document.title ?? "");
    const text = normalizeText(parsed?.textContent ?? "");

    if (text.length > 0) {
      return {
        title: title.length > 0 ? title : null,
        text,
        error: null,
        url
      };
    }

    const fallbackText = bodyTextFallback(document);
    if (fallbackText !== null) {
      return {
        title: title.length > 0 ? title : null,
        text: fallbackText,
        error: null,
        url
      };
    }

    return {
      title: title.length > 0 ? title : null,
      text: null,
      error: "No readable article content found.",
      url
    };
  } finally {
    dom.window.close();
  }
};

export const extractArticleFromUrl = async (url: string): Promise<ExtractedArticle> => {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "driftpet/0.1 (+https://local.mac)"
      },
      redirect: "follow"
    });

    if (!response.ok) {
      return {
        title: null,
        text: null,
        error: `Fetch failed with HTTP ${response.status}.`,
        url
      };
    }

    const html = await response.text();
    return extractArticleFromHtml(html, response.url);
  } catch (error) {
    return {
      title: null,
      text: null,
      error: error instanceof Error ? error.message : "Unknown fetch error.",
      url
    };
  }
};
