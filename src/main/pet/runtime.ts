import { getDatabase } from "../db/client";
import { getPref, setPref } from "../db/prefs";
import type { CardRecord } from "../types/card";

const PET_HOURLY_BUDGET_PREF = "pet_hourly_budget";
const DEFAULT_HOURLY_BUDGET = 3;
const MIN_HOURLY_BUDGET = 0;
const MAX_HOURLY_BUDGET = 9;
const HOUR_MS = 60 * 60 * 1000;
export const AUTO_SURFACE_COOLDOWN_MS = 10 * 60 * 1000;

export type AutoSurfaceReason = "ok" | "budget_reached" | "cooldown";

export type AutoSurfaceDecision = {
  allowed: boolean;
  hourlyBudget: number;
  shownThisHour: number;
  reason: AutoSurfaceReason;
  lastShownAt: number | null;
  cooldownMs: number;
  cooldownRemainingMs: number;
};

const clampBudget = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_HOURLY_BUDGET;
  }

  return Math.min(MAX_HOURLY_BUDGET, Math.max(MIN_HOURLY_BUDGET, Math.round(value)));
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

export const getLastAutoCardShownAt = (): number | null => {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT created_at AS createdAt
    FROM events
    WHERE type = 'card_shown_auto'
    ORDER BY created_at DESC
    LIMIT 1
  `).get() as { createdAt: number } | undefined;

  return row?.createdAt ?? null;
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
  const hourlyBudget = getPetHourlyBudget();
  const shownThisHour = getShownAutoCardsThisHour();
  const lastShownAt = getLastAutoCardShownAt();
  const cooldownRemainingMs = lastShownAt === null
    ? 0
    : Math.max(0, AUTO_SURFACE_COOLDOWN_MS - (Date.now() - lastShownAt));

  if (shownThisHour >= hourlyBudget) {
    return {
      allowed: false,
      hourlyBudget,
      shownThisHour,
      reason: "budget_reached",
      lastShownAt,
      cooldownMs: AUTO_SURFACE_COOLDOWN_MS,
      cooldownRemainingMs
    };
  }

  if (cooldownRemainingMs > 0) {
    return {
      allowed: false,
      hourlyBudget,
      shownThisHour,
      reason: "cooldown",
      lastShownAt,
      cooldownMs: AUTO_SURFACE_COOLDOWN_MS,
      cooldownRemainingMs
    };
  }

  return {
    allowed: true,
    hourlyBudget,
    shownThisHour,
    reason: "ok",
    lastShownAt,
    cooldownMs: AUTO_SURFACE_COOLDOWN_MS,
    cooldownRemainingMs
  };
};
