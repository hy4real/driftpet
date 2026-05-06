import { sendAnthropicPrompt } from "./anthropic";
import { getLlmRuntimeConfig } from "./config";
import { sendOpenAiCompatiblePrompt, sendOpenAiResponsesPrompt } from "./openai";

type PromptArgs = {
  prompt: string;
  model: string;
  maxTokens: number;
};

export const canUseLlm = (): boolean => {
  try {
    const config = getLlmRuntimeConfig();
    return config.apiKey !== null;
  } catch {
    return false;
  }
};

export const getLlmMissingReason = (): string => {
  try {
    const config = getLlmRuntimeConfig();

    if (config.apiKey !== null) {
      return "";
    }

    if (config.provider === "anthropic") {
      return "ANTHROPIC_API_KEY or DRIFTPET_LLM_API_KEY missing";
    }

    if (config.provider === "openai") {
      return "OPENAI_API_KEY or DRIFTPET_LLM_API_KEY missing";
    }

    return "DEEPSEEK_API_KEY, OPENAI_API_KEY, or DRIFTPET_LLM_API_KEY missing";
  } catch (error) {
    return error instanceof Error ? error.message : "LLM config invalid";
  }
};

export const sendTextPrompt = async ({
  prompt,
  model,
  maxTokens
}: PromptArgs): Promise<string> => {
  const config = getLlmRuntimeConfig();

  if (config.provider === "anthropic") {
    return sendAnthropicPrompt({
      config,
      prompt,
      model,
      maxTokens
    });
  }

  if (config.provider === "openai") {
    return sendOpenAiResponsesPrompt({
      config,
      prompt,
      model,
      maxTokens
    });
  }

  return sendOpenAiCompatiblePrompt({
    config,
    prompt,
    model,
    maxTokens
  });
};
