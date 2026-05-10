UPDATE cards
SET title = substr(
  cards.title,
  length('笔记已接住：') + 1,
  length(cards.title) - length('笔记已接住：') - length('.md')
)
WHERE EXISTS (
    SELECT 1
    FROM items
    WHERE items.id = cards.item_id
      AND items.processor IN ('video-to-note', 'article-to-note', 'video-to-note:fallback', 'article-to-note:fallback')
)
  AND cards.title LIKE '笔记已接住：%.md';
