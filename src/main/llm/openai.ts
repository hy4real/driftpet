import type { LlmRuntimeConfig } from "./config";

type OpenAiResponsesOutputContent = {
  type?: string;
  text?: string;
};

type OpenAiResponsesOutputItem = {
  type?: string;
  content?: OpenAiResponsesOutputContent[];
};

type OpenAiResponsesPayload = {
  output?: OpenAiResponsesOutputItem[];
  error?: {
    message?: string;
  };
};

type OpenAiCompatiblePayload = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type OpenAiPromptArgs = {
  config: LlmRuntimeConfig;
  prompt: string;
  model: string;
  maxTokens: number;
};

const parseResponsesText = (payload: OpenAiResponsesPayload): string => {
  const text = (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();

  if (text.length === 0) {
    throw new Error("OpenAI Responses API returned no text content.");
  }

  return text;
};

const parseCompatibleText = (payload: OpenAiCompatiblePayload): string => {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    const normalized = content.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  if (Array.isArray(content)) {
    const text = content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text ?? "")
      .join("\n")
      .trim();

    if (text.length > 0) {
      return text;
    }
  }

  throw new Error("OpenAI-compatible endpoint returned no text content.");
};

export const sendOpenAiResponsesPrompt = async ({
  config,
  prompt,
  model,
  maxTokens
}: OpenAiPromptArgs): Promise<string> => {
  if (config.apiKey === null) {
    throw new Error("OpenAI API key is missing.");
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model,
      max_output_tokens: maxTokens,
      input: prompt
    })
  });

  const payload = await response.json() as OpenAiResponsesPayload;
  if (!response.ok) {
    const message = payload.error?.message ?? `OpenAI Responses request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return parseResponsesText(payload);
};

export const sendOpenAiCompatiblePrompt = async ({
  config,
  prompt,
  model,
  maxTokens
}: OpenAiPromptArgs): Promise<string> => {
  if (config.apiKey === null) {
    throw new Error("OpenAI-compatible API key is missing.");
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`
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
    })
  });

  const payload = await response.json() as OpenAiCompatiblePayload;
  if (!response.ok) {
    const message = payload.error?.message ?? `OpenAI-compatible request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return parseCompatibleText(payload);
};
