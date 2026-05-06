ALTER TABLE items ADD COLUMN origin TEXT NOT NULL DEFAULT 'real';

UPDATE items
SET origin = 'synthetic'
WHERE
  tg_message_id LIKE 'smoke:%'
  OR tg_message_id LIKE '777001:%'
  OR lower(coalesce(extracted_title, '')) LIKE '%smoke test%'
  OR lower(coalesce(raw_text, '')) LIKE '%smoke test%';
