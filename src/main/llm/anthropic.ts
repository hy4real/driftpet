const ANTHROPIC_VERSION = "2023-06-01";
import type { LlmRuntimeConfig } from "./config";

type AnthropicTextBlock = {
  type: string;
  text?: string;
};

type AnthropicResponse = {
  content?: AnthropicTextBlock[];
  error?: {
    message?: string;
  };
};

type AnthropicPromptArgs = {
  config: LlmRuntimeConfig;
  prompt: string;
  model: string;
  maxTokens: number;
};

export const sendAnthropicPrompt = async ({
  config,
  prompt,
  model,
  maxTokens
}: AnthropicPromptArgs): Promise<string> => {
  if (config.apiKey === null) {
    throw new Error("Anthropic API key is missing.");
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    }),
    signal: AbortSignal.timeout(30_000)
  });

  const payload = await response.json() as AnthropicResponse;
  if (!response.ok) {
    const message = payload.error?.message ?? `Anthropic request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  const text = (payload.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();

  if (text.length === 0) {
    throw new Error("Anthropic returned no text content.");
  }

  return text;
};
