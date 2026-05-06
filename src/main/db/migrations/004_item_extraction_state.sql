ALTER TABLE items ADD COLUMN extraction_stage TEXT;

ALTER TABLE items ADD COLUMN extraction_error TEXT;

UPDATE items
SET
  extraction_stage = CASE
    WHEN raw_url IS NULL THEN 'not_applicable'
    WHEN lower(coalesce(last_error, '')) LIKE '%fetch failed%' THEN 'fetch_failed'
    WHEN lower(coalesce(last_error, '')) LIKE '%unknown fetch error%' THEN 'fetch_failed'
    WHEN lower(coalesce(last_error, '')) LIKE '%no readable article content found%' THEN 'no_content'
    WHEN extracted_text IS NOT NULL AND trim(extracted_text) <> '' THEN 'readability'
    ELSE 'no_content'
  END,
  extraction_error = CASE
    WHEN raw_url IS NULL THEN NULL
    WHEN lower(coalesce(last_error, '')) LIKE '%fetch failed%' THEN last_error
    WHEN lower(coalesce(last_error, '')) LIKE '%unknown fetch error%' THEN last_error
    WHEN lower(coalesce(last_error, '')) LIKE '%no readable article content found%' THEN last_error
    ELSE NULL
  END
WHERE extraction_stage IS NULL;
