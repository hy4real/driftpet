import fs from "node:fs";
import path from "node:path";
import { getPetdexRuntimeDir } from "../paths";

export type PetdexRuntimeExpression =
  | "idle"
  | "running"
  | "waiting"
  | "waving"
  | "jumping"
  | "failed"
  | "review";

export type PetdexRuntimeState = {
  expression: PetdexRuntimeExpression;
  durationMs: number | null;
  updatedAt: number | null;
  counter: number | null;
  agentSource: string | null;
};

export type PetdexRuntimeBubble = {
  text: string;
  agentSource: string | null;
  updatedAt: number | null;
  counter: number | null;
};

type RawPetdexRuntimeState = {
  state?: unknown;
  duration?: unknown;
  updatedAt?: unknown;
  counter?: unknown;
  agent_source?: unknown;
};

type RawPetdexRuntimeBubble = {
  text?: unknown;
  updatedAt?: unknown;
  counter?: unknown;
  agent_source?: unknown;
};

const PETDEX_STATE_PATH = "state.json";
const PETDEX_BUBBLE_PATH = "bubble.json";
const VALID_EXPRESSIONS = new Set<PetdexRuntimeExpression>([
  "idle",
  "running",
  "waiting",
  "waving",
  "jumping",
  "failed",
  "review",
]);

const normalizeExpression = (value: unknown): PetdexRuntimeExpression => {
  if (typeof value !== "string") {
    return "idle";
  }

  const normalized = value === "running-left" || value === "running-right"
    ? "running"
    : value;
  return VALID_EXPRESSIONS.has(normalized as PetdexRuntimeExpression)
    ? normalized as PetdexRuntimeExpression
    : "idle";
};

const normalizeDuration = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value);
};

const normalizeNumber = (value: unknown): number | null => {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export const getPetdexRuntimeStatePath = (): string => {
  return path.join(getPetdexRuntimeDir(), PETDEX_STATE_PATH);
};

export const getPetdexRuntimeBubblePath = (): string => {
  return path.join(getPetdexRuntimeDir(), PETDEX_BUBBLE_PATH);
};

export const parsePetdexRuntimeState = (
  raw: string
): PetdexRuntimeState | null => {
  try {
    const parsed = JSON.parse(raw) as RawPetdexRuntimeState;
    return {
      expression: normalizeExpression(parsed.state),
      durationMs: normalizeDuration(parsed.duration),
      updatedAt: normalizeNumber(parsed.updatedAt),
      counter: normalizeNumber(parsed.counter),
      agentSource: typeof parsed.agent_source === "string" ? parsed.agent_source : null,
    };
  } catch {
    return null;
  }
};

export const readPetdexRuntimeState = (): PetdexRuntimeState | null => {
  const statePath = getPetdexRuntimeStatePath();
  if (!fs.existsSync(statePath)) {
    return null;
  }

  return parsePetdexRuntimeState(fs.readFileSync(statePath, "utf-8"));
};

export const parsePetdexRuntimeBubble = (
  raw: string
): PetdexRuntimeBubble | null => {
  try {
    const parsed = JSON.parse(raw) as RawPetdexRuntimeBubble;
    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      agentSource: typeof parsed.agent_source === "string" ? parsed.agent_source : null,
      updatedAt: normalizeNumber(parsed.updatedAt),
      counter: normalizeNumber(parsed.counter),
    };
  } catch {
    return null;
  }
};

export const readPetdexRuntimeBubble = (): PetdexRuntimeBubble | null => {
  const bubblePath = getPetdexRuntimeBubblePath();
  if (!fs.existsSync(bubblePath)) {
    return null;
  }

  return parsePetdexRuntimeBubble(fs.readFileSync(bubblePath, "utf-8"));
};

export const watchPetdexRuntime = (
  onStateChange: (state: PetdexRuntimeState) => void,
  onBubbleChange: (bubble: PetdexRuntimeBubble) => void
): (() => void) => {
  const statePath = getPetdexRuntimeStatePath();
  const bubblePath = getPetdexRuntimeBubblePath();
  const runtimeDir = path.dirname(statePath);
  let closed = false;
  let lastStateSignature = "";
  let lastBubbleSignature = "";
  let watcher: fs.FSWatcher | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const emitStateIfChanged = (): void => {
    if (closed) {
      return;
    }

    const state = readPetdexRuntimeState();
    if (state === null) {
      return;
    }

    const signature = JSON.stringify(state);
    if (signature === lastStateSignature) {
      return;
    }

    lastStateSignature = signature;
    onStateChange(state);
  };

  const emitBubbleIfChanged = (): void => {
    if (closed) {
      return;
    }

    const bubble = readPetdexRuntimeBubble();
    if (bubble === null) {
      return;
    }

    const signature = JSON.stringify(bubble);
    if (signature === lastBubbleSignature) {
      return;
    }

    lastBubbleSignature = signature;
    onBubbleChange(bubble);
  };

  const emitIfChanged = (): void => {
    emitStateIfChanged();
    emitBubbleIfChanged();
  };

  fs.mkdirSync(runtimeDir, { recursive: true });
  emitIfChanged();

  try {
    watcher = fs.watch(runtimeDir, (_event, filename) => {
      if (filename === PETDEX_STATE_PATH || filename === PETDEX_BUBBLE_PATH) {
        emitIfChanged();
      }
    });
  } catch {
    pollTimer = setInterval(emitIfChanged, 500);
  }

  return () => {
    closed = true;
    watcher?.close();
    if (pollTimer !== null) {
      clearInterval(pollTimer);
    }
  };
};

export const watchPetdexRuntimeState = (
  onChange: (state: PetdexRuntimeState) => void
): (() => void) => {
  return watchPetdexRuntime(onChange, () => undefined);
};

export const watchPetdexRuntimeBubble = (
  onChange: (bubble: PetdexRuntimeBubble) => void
): (() => void) => {
  return watchPetdexRuntime(() => undefined, onChange);
};
