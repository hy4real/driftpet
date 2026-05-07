DELETE FROM card_embeddings
WHERE card_id IN (
  SELECT duplicate.id
  FROM cards AS duplicate
  JOIN (
    SELECT item_id, MAX(id) AS keep_id
    FROM cards
    GROUP BY item_id
    HAVING COUNT(*) > 1
  ) AS dedupe
    ON dedupe.item_id = duplicate.item_id
  WHERE duplicate.id <> dedupe.keep_id
);

DELETE FROM events
WHERE type = 'card_created'
  AND json_extract(payload, '$.cardId') IN (
    SELECT duplicate.id
    FROM cards AS duplicate
    JOIN (
      SELECT item_id, MAX(id) AS keep_id
      FROM cards
      GROUP BY item_id
      HAVING COUNT(*) > 1
    ) AS dedupe
      ON dedupe.item_id = duplicate.item_id
    WHERE duplicate.id <> dedupe.keep_id
  );

DELETE FROM cards
WHERE id IN (
  SELECT duplicate.id
  FROM cards AS duplicate
  JOIN (
    SELECT item_id, MAX(id) AS keep_id
    FROM cards
    GROUP BY item_id
    HAVING COUNT(*) > 1
  ) AS dedupe
    ON dedupe.item_id = duplicate.item_id
  WHERE duplicate.id <> dedupe.keep_id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_item_id
ON cards(item_id);
