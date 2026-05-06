import { getDatabase } from "../db/client";
import { getPref, setPref } from "../db/prefs";
import type { CardRecord } from "../types/card";
import type { PetMode } from "../types/status";

const PET_MODE_PREF = "pet_mode";
const PET_HOURLY_BUDGET_PREF = "pet_hourly_budget";
const DEFAULT_MODE: PetMode = "focus";
const DEFAULT_HOURLY_BUDGET = 3;
const MIN_HOURLY_BUDGET = 0;
const MAX_HOURLY_BUDGET = 9;
const HOUR_MS = 60 * 60 * 1000;

type AutoSurfaceReason = "ok" | "sleep_mode" | "budget_reached";

export type AutoSurfaceDecision = {
  allowed: boolean;
  mode: PetMode;
  hourlyBudget: number;
  shownThisHour: number;
  reason: AutoSurfaceReason;
};

const clampBudget = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_HOURLY_BUDGET;
  }

  return Math.min(MAX_HOURLY_BUDGET, Math.max(MIN_HOURLY_BUDGET, Math.round(value)));
};

export const getPetMode = (): PetMode => {
  const value = getPref(PET_MODE_PREF);
  return value === "sleep" ? "sleep" : DEFAULT_MODE;
};

export const setPetMode = (mode: PetMode): void => {
  setPref(PET_MODE_PREF, mode);
};

export const getPetHourlyBudget = (): number => {
  const rawValue = getPref(PET_HOURLY_BUDGET_PREF);
  if (rawValue === null) {
    return DEFAULT_HOURLY_BUDGET;
  }

  return clampBudget(Number(rawValue));
};

export const setPetHourlyBudget = (value: number): number => {
  const nextValue = clampBudget(value);
  setPref(PET_HOURLY_BUDGET_PREF, String(nextValue));
  return nextValue;
};

export const getShownAutoCardsThisHour = (): number => {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM events
    WHERE type = 'card_shown_auto'
      AND created_at >= ?
  `).get(Date.now() - HOUR_MS) as { count: number };

  return row.count;
};

const appendEvent = (type: string, payload: unknown): void => {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO events (type, payload, created_at)
    VALUES (?, ?, ?)
  `).run(type, JSON.stringify(payload), Date.now());
};

export const recordAutoCardShown = (card: CardRecord): void => {
  appendEvent("card_shown_auto", {
    cardId: card.id,
    itemId: card.itemId
  });
};

export const recordAutoCardSuppressed = (
  card: CardRecord,
  reason: AutoSurfaceReason
): void => {
  appendEvent("card_suppressed_auto", {
    cardId: card.id,
    itemId: card.itemId,
    reason
  });
};

export const decideAutoSurface = (): AutoSurfaceDecision => {
  const mode = getPetMode();
  const hourlyBudget = getPetHourlyBudget();
  const shownThisHour = getShownAutoCardsThisHour();

  if (mode === "sleep") {
    return {
      allowed: false,
      mode,
      hourlyBudget,
      shownThisHour,
      reason: "sleep_mode"
    };
  }

  if (shownThisHour >= hourlyBudget) {
    return {
      allowed: false,
      mode,
      hourlyBudget,
      shownThisHour,
      reason: "budget_reached"
    };
  }

  return {
    allowed: true,
    mode,
    hourlyBudget,
    shownThisHour,
    reason: "ok"
  };
};
