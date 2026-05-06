import type { ParsedTelegramInput } from "./parse-message";
import { extractArticleFromUrl } from "../extract/article";

export const enrichTelegramInput = async (
  input: ParsedTelegramInput
): Promise<ParsedTelegramInput> => {
  if (input.source !== "tg_url" || input.rawUrl === null) {
    return input;
  }

  const article = await extractArticleFromUrl(input.rawUrl);
  return {
    ...input,
    extractedTitle: article.title,
    extractedText: article.text,
    extractionStage: article.stage,
    extractionError: article.error,
    lastError: article.error
  };
};
