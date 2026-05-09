import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportsDir = path.join(root, "reports");
const dataDir = process.env.DRIFTPET_DATA_DIR?.trim() || path.join(root, "data");
const dbPath = process.env.DRIFTPET_DB_PATH?.trim() || path.join(dataDir, "app.db");

const args = process.argv.slice(2);

const readOption = (name) => {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline !== undefined) {
    return inline.slice(prefix.length);
  }

  const index = args.indexOf(name);
  if (index !== -1) {
    return args[index + 1] ?? "";
  }

  return null;
};

const firstPositional = args.find((arg) => !arg.startsWith("--"));
const limit = Math.max(1, Math.min(100, Number(readOption("--limit") ?? firstPositional ?? 30) || 30));
const sinceInput = readOption("--since") ?? process.env.DRIFTPET_REVIEW_SINCE ?? null;

const parseSince = (value) => {
  if (value === null || value.trim().length === 0) {
    return null;
  }

  const trimmed = value.trim();
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  throw new Error(`Invalid --since value: ${value}`);
};

const sinceMs = parseSince(sinceInput);

const formatDate = (value) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(value);
};

const formatDateTime = (value) => {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
};

const truncate = (value, maxLength) => {
  const collapsed = String(value ?? "").replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  return `${collapsed.slice(0, maxLength - 1)}…`;
};

const parseRelated = (value) => {
  if (typeof value !== "string" || value.length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const qualityFlagsFor = (row, related) => {
  const flags = [];
  const title = row.title?.trim() ?? "";
  const useFor = row.use_for?.trim() ?? "";
  const tag = row.knowledge_tag?.trim() ?? "";
  const remark = row.pet_remark?.trim() ?? "";

  if (title.length === 0 || title.length > 80) {
    flags.push("title");
  }
  if (useFor.length === 0 || useFor.length > 300) {
    flags.push("next-step");
  }
  if (/next concrete output|first five-minute step|下一条具体产出|第?一?个?五分钟动作/i.test(useFor)) {
    flags.push("generic-next-step");
  }
  if (/write the smallest deliverable|最小可交付|todo/i.test(useFor)) {
    flags.push("meta-next-step");
  }
  if (tag.length === 0 || tag.length > 40) {
    flags.push("tag");
  }
  if (remark.length === 0 || remark.length > 120) {
    flags.push("remark");
  }
  if (row.source === "manual_chaos" && related.length > 2) {
    flags.push("noisy-recall");
  }

  return flags;
};

const reviewTemplate = (flags) => ({
  titleSpecific: "",
  nextStepActionable: "",
  recallUseful: "",
  resumeHelpful: "",
  failureBucket: flags.join(", "),
  notes: "",
});

if (!fs.existsSync(dbPath)) {
  throw new Error(`SQLite database not found: ${dbPath}`);
}

const sql = `
  SELECT
    items.id AS item_id,
    items.source,
    items.raw_url,
    items.raw_text,
    items.extracted_title,
    items.received_at,
    items.status,
    items.last_error,
    items.extraction_stage,
    items.extraction_error,
    cards.id AS card_id,
    cards.title,
    cards.use_for,
    cards.knowledge_tag,
    cards.summary_for_retrieval,
    cards.related_card_ids,
    cards.pet_remark,
    cards.created_at
  FROM cards
  INNER JOIN items ON items.id = cards.item_id
  WHERE items.origin = 'real'
    ${sinceMs === null ? "" : `AND cards.created_at >= ${sinceMs}`}
  ORDER BY cards.created_at DESC
  LIMIT ${limit}
`;

const sqliteOutput = execFileSync("sqlite3", [
  "-json",
  dbPath,
  sql,
], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
}).trim();
const rows = sqliteOutput.length === 0 ? [] : JSON.parse(sqliteOutput);

fs.mkdirSync(reportsDir, { recursive: true });

const reportDate = formatDate(new Date());
const basename = `real-usage-review-${reportDate}`;
const markdownPath = path.join(reportsDir, `${basename}.md`);
const jsonPath = path.join(reportsDir, `${basename}.json`);

const cards = rows.map((row, index) => {
  const related = parseRelated(row.related_card_ids);
  const flags = qualityFlagsFor(row, related);

  return {
    index: index + 1,
    itemId: row.item_id,
    cardId: row.card_id,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
    createdAtLabel: formatDateTime(row.created_at),
    title: row.title ?? "",
    useFor: row.use_for ?? "",
    knowledgeTag: row.knowledge_tag ?? "",
    petRemark: row.pet_remark ?? "",
    related,
    relatedCount: related.length,
    rawUrl: row.raw_url,
    extractedTitle: row.extracted_title,
    rawTextPreview: truncate(row.raw_text, 220),
    extractionStage: row.extraction_stage,
    extractionError: row.extraction_error,
    lastError: row.last_error,
    qualityFlags: flags,
    review: reviewTemplate(flags),
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  dbPath,
  requestedLimit: limit,
  since: sinceInput,
  sinceMs,
  cards: cards.length,
  bySource: cards.reduce((acc, card) => {
    acc[card.source] = (acc[card.source] ?? 0) + 1;
    return acc;
  }, {}),
  flaggedCards: cards.filter((card) => card.qualityFlags.length > 0).length,
};

fs.writeFileSync(jsonPath, `${JSON.stringify({ summary, cards }, null, 2)}\n`);

const markdown = [
  `# driftpet Real Usage Review - ${reportDate}`,
  "",
  "Use this as an annotation sheet after a real usage batch. Fill the four review columns with `yes`, `no`, or a short note.",
  "",
  "## Summary",
  "",
  `- Database: \`${dbPath}\``,
  `- Cards exported: ${summary.cards}`,
  `- Since: ${summary.since ?? "not filtered"}`,
  `- Flagged by heuristics: ${summary.flaggedCards}`,
  `- Sources: ${Object.entries(summary.bySource).map(([source, count]) => `${source}=${count}`).join(", ") || "none"}`,
  "",
  "## Review Rubric",
  "",
  "- `Title specific`: does the title name the concrete thread/deliverable?",
  "- `Next step actionable`: can you do it in the next five minutes?",
  "- `Recall useful`: did related memory genuinely help resume the thread?",
  "- `Resume helpful`: would this card help you return after interruption?",
  "",
  "## Cards",
  "",
  ...cards.flatMap((card) => [
    `### ${card.index}. ${card.title || "(untitled card)"}`,
    "",
    `- Card: #${card.cardId} / item #${card.itemId}`,
    `- Source: ${card.source} · ${card.createdAtLabel}`,
    `- Tag: ${card.knowledgeTag || "(none)"}`,
    `- Quality flags: ${card.qualityFlags.length === 0 ? "none" : card.qualityFlags.join(", ")}`,
    `- Raw: ${card.rawUrl ?? card.extractedTitle ?? card.rawTextPreview ?? "(none)"}`,
    "",
    `**Next step:** ${card.useFor || "(none)"}`,
    "",
    `**Pet remark:** ${card.petRemark || "(none)"}`,
    "",
    "**Related recall:**",
    "",
    ...(card.related.length === 0
      ? ["- none"]
      : card.related.map((entry, relatedIndex) => `- ${relatedIndex + 1}. ${entry.title ?? "(untitled)"} — ${entry.reason ?? "(no reason)"}`)),
    "",
    "| Check | Your review |",
    "| --- | --- |",
    "| Title specific |  |",
    "| Next step actionable |  |",
    "| Recall useful |  |",
    "| Resume helpful |  |",
    "| Failure bucket |  |",
    "| Notes |  |",
    "",
  ]),
].join("\n");

fs.writeFileSync(markdownPath, markdown);

console.log(JSON.stringify({
  ok: true,
  markdownPath,
  jsonPath,
  cards: summary.cards,
  flaggedCards: summary.flaggedCards,
  since: summary.since,
}, null, 2));
