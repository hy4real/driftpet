import { getDatabase } from "./client";

type PrefRow = {
  value: string;
};

export const getPref = (key: string): string | null => {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT value
    FROM prefs
    WHERE key = ?
    LIMIT 1
  `).get(key) as PrefRow | undefined;

  return row?.value ?? null;
};

export const setPref = (key: string, value: string): void => {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO prefs (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
};
