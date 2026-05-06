import { ensureEnvLoaded } from "../env";

ensureEnvLoaded();

export type LlmProvider = "anthropic" | "openai" | "openai-compatible";
export type EmbeddingProvider = "openai" | "openai-compatible" | "ollama" | "disabled";

export type LlmRuntimeConfig = {
  provider: LlmProvider;
  apiKey: string | null;
  baseUrl: string | null;
  endpoint: string;
};

export type EmbeddingRuntimeConfig = {
  provider: EmbeddingProvider;
  apiKey: string | null;
  baseUrl: string | null;
  endpoint: string | null;
  model: string | null;
};

const trimTrailingSlash = (value: string): string => {
  return value.replace(/\/+$/, "");
};

const getEnv = (name: string): string | null => {
  const value = process.env[name];
  return value !== undefined && value.length > 0 ? value : null;
};

const getProvider = (): LlmProvider => {
  const provider = (process.env.DRIFTPET_LLM_PROVIDER ?? "anthropic").trim().toLowerCase();

  if (provider === "openai" || provider === "openai-compatible" || provider === "anthropic") {
    return provider;
  }

  return "anthropic";
};

const getApiKey = (provider: LlmProvider): string | null => {
  const shared = getEnv("DRIFTPET_LLM_API_KEY");
  if (shared !== null) {
    return shared;
  }

  if (provider === "anthropic") {
    return getEnv("ANTHROPIC_API_KEY");
  }

  if (provider === "openai") {
    return getEnv("OPENAI_API_KEY");
  }

  return getEnv("DEEPSEEK_API_KEY") ?? getEnv("OPENAI_API_KEY");
};

const getBaseUrl = (provider: LlmProvider): string | null => {
  const shared = getEnv("DRIFTPET_LLM_BASE_URL");
  if (shared !== null) {
    return trimTrailingSlash(shared);
  }

  if (provider === "anthropic") {
    return "https://api.anthropic.com/v1";
  }

  if (provider === "openai") {
    return "https://api.openai.com/v1";
  }

  return null;
};

const getEmbeddingProvider = (): EmbeddingProvider => {
  const explicit = getEnv("DRIFTPET_EMBED_PROVIDER");
  if (explicit !== null) {
    const normalized = explicit.trim().toLowerCase();
    if (
      normalized === "openai" ||
      normalized === "openai-compatible" ||
      normalized === "ollama" ||
      normalized === "disabled"
    ) {
      return normalized;
    }
  }

  const llmProvider = getProvider();
  if (llmProvider === "openai" || llmProvider === "openai-compatible") {
    return llmProvider;
  }

  return "disabled";
};

const getEmbeddingApiKey = (provider: EmbeddingProvider): string | null => {
  const explicit = getEnv("DRIFTPET_EMBED_API_KEY");
  if (explicit !== null) {
    return explicit;
  }

  if (provider === "disabled" || provider === "ollama") {
    return null;
  }

  if (provider === "openai") {
    return getEnv("OPENAI_API_KEY") ?? getEnv("DRIFTPET_LLM_API_KEY");
  }

  return getEnv("DEEPSEEK_API_KEY") ?? getEnv("OPENAI_API_KEY") ?? getEnv("DRIFTPET_LLM_API_KEY");
};

const getEmbeddingBaseUrl = (provider: EmbeddingProvider): string | null => {
  const explicit = getEnv("DRIFTPET_EMBED_BASE_URL");
  if (explicit !== null) {
    return trimTrailingSlash(explicit);
  }

  if (provider === "openai") {
    return "https://api.openai.com/v1";
  }

  if (provider === "openai-compatible") {
    const llmBaseUrl = getEnv("DRIFTPET_LLM_BASE_URL");
    return llmBaseUrl !== null ? trimTrailingSlash(llmBaseUrl) : null;
  }

   if (provider === "ollama") {
    return "http://127.0.0.1:11434";
  }

  return null;
};

const getEmbeddingEndpoint = (
  provider: EmbeddingProvider,
  baseUrl: string | null
): string | null => {
  const override = getEnv("DRIFTPET_EMBED_ENDPOINT");
  if (override !== null) {
    return override;
  }

  if (provider === "disabled") {
    return null;
  }

  if (baseUrl === null) {
    throw new Error("Embedding base URL is missing for the configured embedding provider.");
  }

  if (provider === "ollama") {
    return `${baseUrl}/api/embed`;
  }

  return `${baseUrl}/embeddings`;
};

const getEndpoint = (provider: LlmProvider, baseUrl: string | null): string => {
  const override = getEnv("DRIFTPET_LLM_ENDPOINT");
  if (override !== null) {
    return override;
  }

  if (provider === "anthropic") {
    return `${baseUrl ?? "https://api.anthropic.com/v1"}/messages`;
  }

  if (provider === "openai") {
    return `${baseUrl ?? "https://api.openai.com/v1"}/responses`;
  }

  if (baseUrl === null) {
    throw new Error("DRIFTPET_LLM_BASE_URL is required for openai-compatible provider.");
  }

  return `${baseUrl}/chat/completions`;
};

export const getLlmRuntimeConfig = (): LlmRuntimeConfig => {
  const provider = getProvider();
  const baseUrl = getBaseUrl(provider);

  return {
    provider,
    apiKey: getApiKey(provider),
    baseUrl,
    endpoint: getEndpoint(provider, baseUrl)
  };
};

export const getEmbeddingRuntimeConfig = (): EmbeddingRuntimeConfig => {
  const provider = getEmbeddingProvider();
  const baseUrl = getEmbeddingBaseUrl(provider);

  return {
    provider,
    apiKey: getEmbeddingApiKey(provider),
    baseUrl,
    endpoint: getEmbeddingEndpoint(provider, baseUrl),
    model: provider === "disabled"
      ? null
      : (getEnv("DRIFTPET_EMBED_MODEL") ?? (provider === "ollama" ? "qwen3-embedding:0.6b" : "text-embedding-3-small"))
  };
};
