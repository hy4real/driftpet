import { getEmbeddingRuntimeConfig } from "./config";

type EmbeddingPayload = {
  data?: Array<{
    embedding?: number[];
  }>;
  embeddings?: number[][];
  error?: {
    message?: string;
  } | string;
};

export const canUseEmbeddings = (): boolean => {
  try {
    const config = getEmbeddingRuntimeConfig();
    if (config.provider === "disabled" || config.endpoint === null || config.model === null) {
      return false;
    }

    if (config.provider === "ollama") {
      return true;
    }

    return config.apiKey !== null;
  } catch {
    return false;
  }
};

export const getEmbeddingMissingReason = (): string => {
  try {
    const config = getEmbeddingRuntimeConfig();
    if (config.provider === "disabled") {
      return "Embeddings disabled";
    }

    if (config.provider !== "ollama" && config.apiKey === null) {
      return "Embedding API key missing";
    }

    if (config.endpoint === null || config.model === null) {
      return "Embedding endpoint or model missing";
    }

    return "";
  } catch (error) {
    return error instanceof Error ? error.message : "Embedding config invalid";
  }
};

export const generateEmbedding = async (input: string): Promise<number[] | null> => {
  const config = getEmbeddingRuntimeConfig();

  if (config.provider === "disabled" || config.endpoint === null || config.model === null) {
    return null;
  }

  if (config.provider !== "ollama" && config.apiKey === null) {
    return null;
  }

  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (config.apiKey !== null) {
    headers.authorization = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      input,
      ...(config.provider === "ollama" ? {} : { encoding_format: "float" })
    }),
    signal: AbortSignal.timeout(15_000)
  });

  const payload = await response.json() as EmbeddingPayload;
  if (!response.ok) {
    const message = typeof payload.error === "string"
      ? payload.error
      : payload.error?.message ?? `Embedding request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  const vector = config.provider === "ollama"
    ? payload.embeddings?.[0]
    : payload.data?.[0]?.embedding;

  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error("Embedding response contained no vector.");
  }

  return vector;
};
