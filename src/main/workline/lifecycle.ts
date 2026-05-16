import { CARD_SELECT_COLUMNS, mapCardRow, parseThreadCache, type CardRow } from "../db/cards";
import { getDatabase } from "../db/client";
import { getPref, setPref } from "../db/prefs";
import type { CardLifecycleStatus, CardRecord } from "../types/card";

export const HOT_WORKLINE_LIMIT = 3;
export const RECOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DAILY_CLOSE_LINE_DAY_PREF = "workline_daily_close_line_day";

export type WorklineLifecycleAction =
  | "continue_guarding"
  | "tomorrow"
  | "archive"
  | "drop"
  | "later_today"
  | "recover";

export type CardLifecyclePatch = {
  lifecycleStatus: CardLifecycleStatus;
  ttlAt: number | null;
  recoverUntil: number | null;
  lastTouchedAt: number;
  tomorrowFloatAt: number | null;
  tomorrowFloatedAt: number | null;
};

type LifecycleSource = {
  threadCacheJson?: string | null;
  lifecycleStatus?: CardLifecycleStatus;
};

const startOfLocalDay = (value: number): number => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export const endOfLocalDay = (value: number): number => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

export const startOfNextLocalDay = (value: number): number => {
  const date = new Date(startOfLocalDay(value));
  date.setDate(date.getDate() + 1);
  return date.getTime();
};

export const endOfNextLocalDay = (value: number): number => {
  const date = new Date(startOfLocalDay(value));
  date.setDate(date.getDate() + 1);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
};

const getLocalDayKey = (value: number): string => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const buildInitialCardLifecycle = (now = Date.now()): CardLifecyclePatch => ({
  lifecycleStatus: "cooling",
  ttlAt: endOfLocalDay(now),
  recoverUntil: null,
  lastTouchedAt: now,
  tomorrowFloatAt: null,
  tomorrowFloatedAt: null,
});

const hasActiveWaiting = (source: LifecycleSource): boolean => {
  const cache = parseThreadCache(source.threadCacheJson ?? null);
  return cache?.waitingOn !== null && cache?.waitingOn !== undefined && cache.waitingResolvedAt === null;
};

export const buildLifecyclePatch = (
  action: WorklineLifecycleAction,
  source: LifecycleSource,
  now = Date.now()
): CardLifecyclePatch => {
  if (action === "continue_guarding") {
    return {
      lifecycleStatus: hasActiveWaiting(source) ? "waiting" : "hot",
      ttlAt: endOfLocalDay(now),
      recoverUntil: null,
      lastTouchedAt: now,
      tomorrowFloatAt: null,
      tomorrowFloatedAt: null,
    };
  }

  if (action === "tomorrow") {
    return {
      lifecycleStatus: "waiting",
      ttlAt: endOfNextLocalDay(now),
      recoverUntil: null,
      lastTouchedAt: now,
      tomorrowFloatAt: startOfNextLocalDay(now),
      tomorrowFloatedAt: null,
    };
  }

  if (action === "archive") {
    return {
      lifecycleStatus: "archived",
      ttlAt: null,
      recoverUntil: null,
      lastTouchedAt: now,
      tomorrowFloatAt: null,
      tomorrowFloatedAt: null,
    };
  }

  if (action === "drop") {
    return {
      lifecycleStatus: "dropped",
      ttlAt: null,
      recoverUntil: now + RECOVERY_WINDOW_MS,
      lastTouchedAt: now,
      tomorrowFloatAt: null,
      tomorrowFloatedAt: null,
    };
  }

  return {
    lifecycleStatus: "cooling",
    ttlAt: endOfLocalDay(now),
    recoverUntil: null,
    lastTouchedAt: now,
    tomorrowFloatAt: null,
    tomorrowFloatedAt: null,
  };
};

const getCardLifecycleSource = (cardId: number): (LifecycleSource & {
  id: number;
  recoverUntil: number | null;
}) | null => {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      id,
      lifecycle_status AS lifecycleStatus,
      recover_until AS recoverUntil,
      thread_cache_json AS threadCacheJson
    FROM cards
    WHERE id = ?
    LIMIT 1
  `).get(cardId) as {
    id: number;
    lifecycleStatus: CardLifecycleStatus;
    recoverUntil: number | null;
    threadCacheJson: string | null;
  } | undefined;

  return row ?? null;
};

export const getHotWorklineCount = (excludeCardId: number | null = null, now = Date.now()): number => {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM cards
    WHERE lifecycle_status = 'hot'
      AND (ttl_at IS NULL OR ttl_at >= ?)
      AND (? IS NULL OR id != ?)
  `).get(now, excludeCardId, excludeCardId) as { count: number };

  return row.count;
};

const readCard = (cardId: number): CardRecord => {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      ${CARD_SELECT_COLUMNS}
    FROM cards
    WHERE id = ?
    LIMIT 1
  `).get(cardId) as CardRow | undefined;

  if (row === undefined) {
    throw new Error(`card not found: ${cardId}`);
  }

  return mapCardRow(row);
};

export const updateCardLifecycle = (
  cardId: number,
  action: WorklineLifecycleAction,
  now = Date.now()
): CardRecord => {
  const source = getCardLifecycleSource(cardId);
  if (source === null) {
    throw new Error(`card not found: ${cardId}`);
  }

  if (action === "recover" && (source.recoverUntil === null || source.recoverUntil < now)) {
    throw new Error("This dropped workline is no longer recoverable.");
  }

  const patch = buildLifecyclePatch(action, source, now);
  if (
    patch.lifecycleStatus === "hot"
    && source.lifecycleStatus !== "hot"
    && getHotWorklineCount(cardId, now) >= HOT_WORKLINE_LIMIT
  ) {
    throw new Error(`driftpet is already guarding ${HOT_WORKLINE_LIMIT} hot worklines.`);
  }

  getDatabase().prepare(`
    UPDATE cards
    SET
      lifecycle_status = ?,
      ttl_at = ?,
      recover_until = ?,
      last_touched_at = ?,
      tomorrow_float_at = ?,
      tomorrow_floated_at = ?
    WHERE id = ?
  `).run(
    patch.lifecycleStatus,
    patch.ttlAt,
    patch.recoverUntil,
    patch.lastTouchedAt,
    patch.tomorrowFloatAt,
    patch.tomorrowFloatedAt,
    cardId
  );

  getDatabase().prepare(`
    INSERT INTO events (type, payload, created_at)
    VALUES (?, ?, ?)
  `).run("workline_lifecycle_changed", JSON.stringify({ cardId, action, lifecycleStatus: patch.lifecycleStatus }), now);

  return readCard(cardId);
};

export const markDueTomorrowWorklinesCooling = (now = Date.now()): number => {
  const result = getDatabase().prepare(`
    UPDATE cards
    SET lifecycle_status = 'cooling',
        ttl_at = ?,
        last_touched_at = ?
    WHERE lifecycle_status = 'waiting'
      AND tomorrow_float_at IS NOT NULL
      AND tomorrow_float_at <= ?
      AND tomorrow_floated_at IS NOT NULL
      AND tomorrow_floated_at < ?
  `).run(endOfLocalDay(now), now, now, startOfLocalDay(now));

  return result.changes;
};

export const markTomorrowWorklineFloated = (cardId: number, now = Date.now()): CardRecord => {
  getDatabase().prepare(`
    UPDATE cards
    SET tomorrow_floated_at = ?,
        last_touched_at = ?
    WHERE id = ?
      AND lifecycle_status = 'waiting'
      AND tomorrow_float_at IS NOT NULL
      AND tomorrow_float_at <= ?
      AND tomorrow_floated_at IS NULL
  `).run(now, now, cardId, now);

  return readCard(cardId);
};

export const listRecoverableDroppedCards = (now = Date.now()): CardRecord[] => {
  const rows = getDatabase().prepare(`
    SELECT
      ${CARD_SELECT_COLUMNS}
    FROM cards
    WHERE lifecycle_status = 'dropped'
      AND recover_until IS NOT NULL
      AND recover_until >= ?
    ORDER BY last_touched_at DESC, created_at DESC
  `).all(now) as CardRow[];

  return rows.map(mapCardRow);
};

const listCloseLineCandidates = (now = Date.now(), limit = 5): CardRecord[] => {
  markDueTomorrowWorklinesCooling(now);
  const rows = getDatabase().prepare(`
    SELECT
      ${CARD_SELECT_COLUMNS}
    FROM cards
    WHERE cards.item_id IN (SELECT id FROM items WHERE origin = 'real')
      AND cards.lifecycle_status IN ('hot', 'waiting', 'cooling')
      AND cards.ttl_at IS NOT NULL
      AND cards.ttl_at <= ?
    ORDER BY
      CASE cards.lifecycle_status WHEN 'hot' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END ASC,
      COALESCE(cards.last_touched_at, cards.created_at) DESC,
      cards.created_at DESC
    LIMIT ?
  `).all(now, limit) as CardRow[];

  return rows.map(mapCardRow);
};

export const takeDailyCloseLineCandidates = (now = Date.now(), limit = 5): CardRecord[] => {
  const dayKey = getLocalDayKey(now);
  if (getPref(DAILY_CLOSE_LINE_DAY_PREF) === dayKey) {
    return [];
  }

  const candidates = listCloseLineCandidates(now, limit);
  if (candidates.length === 0) {
    return [];
  }

  setPref(DAILY_CLOSE_LINE_DAY_PREF, dayKey);
  getDatabase().prepare(`
    INSERT INTO events (type, payload, created_at)
    VALUES (?, ?, ?)
  `).run("daily_close_line_shown", JSON.stringify({ cardIds: candidates.map((card) => card.id) }), now);

  return candidates;
};

export const skipDailyCloseLine = (cardIds: number[], now = Date.now()): number => {
  setPref(DAILY_CLOSE_LINE_DAY_PREF, getLocalDayKey(now));
  if (cardIds.length === 0) {
    getDatabase().prepare(`
      INSERT INTO events (type, payload, created_at)
      VALUES (?, ?, ?)
    `).run("daily_close_line_skipped", JSON.stringify({ cardIds: [] }), now);
    return 0;
  }

  const placeholders = cardIds.map(() => "?").join(", ");
  const result = getDatabase().prepare(`
    UPDATE cards
    SET lifecycle_status = 'cooling',
        ttl_at = ?,
        recover_until = NULL,
        last_touched_at = ?,
        tomorrow_float_at = NULL,
        tomorrow_floated_at = NULL
    WHERE id IN (${placeholders})
      AND lifecycle_status IN ('hot', 'waiting', 'cooling')
  `).run(endOfLocalDay(now), now, ...cardIds);

  getDatabase().prepare(`
    INSERT INTO events (type, payload, created_at)
    VALUES (?, ?, ?)
  `).run("daily_close_line_skipped", JSON.stringify({ cardIds }), now);

  return result.changes;
};
