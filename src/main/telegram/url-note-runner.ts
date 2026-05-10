import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { ensureEnvLoaded } from "../env";
import { classifyUrlNoteKind, type UrlNoteKind } from "./url-classifier";

ensureEnvLoaded();

export type NoteRunnerResult = {
  kind: UrlNoteKind;
  processor: string;
  artifactPath: string | null;
  title: string;
  useFor: string;
  knowledgeTag: string;
  petRemark: string;
  summaryText: string;
  extractionStage: "note_ingested" | "note_failed";
  extractionError: string | null;
  lastError: string | null;
};

const VAULT_DIR = "/Users/mac/my-obsidian-vault";
const CLAUDE_BIN = process.env.DRIFTPET_CLAUDE_BIN?.trim() || "/Users/mac/.local/bin/claude";
const DEFAULT_CLAUDE_TIMEOUT_MS = 420_000;
const VIDEO_METADATA_TIMEOUT_MS = 45_000;

type VideoMetadata = {
  url: string;
  title: string;
  uploader: string | null;
  uploadDate: string | null;
  duration: string | null;
  description: string | null;
  subtitleLanguages: string[];
  usedCookies: boolean;
  cookieError: string | null;
};

type ExistingArtifactMatch = {
  artifactPath: string;
  matchedBy: "source" | "title";
};

const isBilibiliHost = (value: string): boolean => {
  try {
    const hostname = new URL(value).hostname;
    return /(^|\.)bilibili\.com$/i.test(hostname) || /(^|\.)b23\.tv$/i.test(hostname);
  } catch {
    return false;
  }
};

const resolveClaudeTimeoutMs = (): number => {
  const rawValue = process.env.DRIFTPET_CLAUDE_TIMEOUT_MS?.trim() ?? "";
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CLAUDE_TIMEOUT_MS;
  }

  return Math.floor(parsed);
};

const shellQuote = (value: string): string => {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
};

const expandShortVideoUrl = async (url: string): Promise<string> => {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)b23\.tv$/i.test(parsed.hostname)) {
      return url;
    }

    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow"
    });

    return response.url || url;
  } catch {
    return url;
  }
};

const buildPrompt = (url: string, kind: UrlNoteKind): string => {
  if (kind === "video") {
    const isBilibili = isBilibiliHost(url);
    return [
      "/video-to-note",
      url,
      ...(isBilibili
        ? [
          "这是 Bilibili 链接。",
          "如果你要用 yt-dlp，请优先使用 --no-check-certificate。",
          "如果仍然失败，再使用 --cookies-from-browser chrome。"
        ]
        : []),
      "完成后只输出一行：",
      "ARTIFACT: <absolute-or-vault-relative-markdown-path>"
    ].join("\n");
  }

  if (kind === "article") {
    return [
      "/article-to-note",
      url,
      "完成后只输出一行：",
      "ARTIFACT: <absolute-or-vault-relative-markdown-path>"
    ].join("\n");
  }

  return [
    "Do not process this URL.",
    `URL: ${url}`,
    "Reply with exactly these lines and nothing else:",
    "STATUS: unsupported",
    "ARTIFACT: unsupported"
  ].join("\n");
};

export const parseArtifactPath = (output: string): string | null => {
  const match = output.match(/ARTIFACT:\s*(.+)\s*$/m);
  if (match === null) {
    return inferArtifactPath(output);
  }

  const raw = match[1].trim();
  if (raw.length === 0 || raw.toLowerCase() === "unsupported") {
    return null;
  }

  return path.isAbsolute(raw) ? raw : path.join(VAULT_DIR, raw);
};

const normalizeArtifactPath = (raw: string): string => {
  return path.isAbsolute(raw) ? raw : path.join(VAULT_DIR, raw);
};

export const inferArtifactPath = (output: string): string | null => {
  const candidates = Array.from(output.matchAll(/(?:\/Users\/mac\/my-obsidian-vault\/|AI\/)[^\n]*?\.md\b/g))
    .map((match) => match[0].trim())
    .map((value) => normalizeArtifactPath(value.replace(/^"+|"+$/g, "")))
    .filter((candidate, index, all) => all.indexOf(candidate) === index);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates.at(0) ?? null;
};

const readArtifactPreview = (artifactPath: string | null): string => {
  if (artifactPath === null) {
    return "";
  }

  try {
    return fs.readFileSync(artifactPath, "utf8").slice(0, 4000).trim();
  } catch {
    return "";
  }
};

const runClaudePrompt = async (prompt: string): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  return await new Promise((resolve, reject) => {
    const timeoutMs = resolveClaudeTimeoutMs();
    const child = spawn(
      CLAUDE_BIN,
      ["-p", "--dangerously-skip-permissions", prompt],
      {
        cwd: VAULT_DIR,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`Claude note workflow timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1
      });
    });
  });
};

const spawnCommand = async (
  command: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: VAULT_DIR,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1
      });
    });
  });
};

const runYtDlpJson = async (url: string, useCookies: boolean): Promise<VideoMetadata> => {
  const args = [
    "--no-check-certificate",
    "--dump-json",
    "--skip-download"
  ];

  if (useCookies) {
    args.push("--cookies-from-browser", "chrome");
  }

  args.push(url);

  const result = await spawnCommand("/opt/homebrew/bin/yt-dlp", args, VIDEO_METADATA_TIMEOUT_MS);
  if (result.exitCode !== 0) {
    const message = (result.stderr || result.stdout || `yt-dlp exited with code ${result.exitCode}`).trim();
    throw new Error(message);
  }

  const jsonLine = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("{") && line.endsWith("}"));
  if (jsonLine === undefined) {
    throw new Error("yt-dlp returned no metadata JSON.");
  }

  const payload = JSON.parse(jsonLine) as {
    webpage_url?: string;
    title?: string;
    uploader?: string;
    channel?: string;
    upload_date?: string;
    duration_string?: string;
    description?: string;
    automatic_captions?: Record<string, unknown>;
    subtitles?: Record<string, unknown>;
  };

  const automaticLanguages = Object.keys(payload.automatic_captions ?? {});
  const manualLanguages = Object.keys(payload.subtitles ?? {});

  return {
    url: payload.webpage_url ?? url,
    title: payload.title?.trim() || "Untitled video",
    uploader: payload.channel?.trim() || payload.uploader?.trim() || null,
    uploadDate: payload.upload_date?.trim() || null,
    duration: payload.duration_string?.trim() || null,
    description: payload.description?.trim() || null,
    subtitleLanguages: [...automaticLanguages, ...manualLanguages],
    usedCookies: useCookies,
    cookieError: null
  };
};

const fetchVideoMetadata = async (url: string): Promise<VideoMetadata> => {
  try {
    return await runYtDlpJson(url, false);
  } catch (firstError) {
    try {
      const withCookies = await runYtDlpJson(url, true);
      return {
        ...withCookies,
        cookieError: firstError instanceof Error ? firstError.message : String(firstError)
      };
    } catch (secondError) {
      const message = secondError instanceof Error ? secondError.message : String(secondError);
      throw new Error(message);
    }
  }
};

const sanitizeNoteName = (value: string): string => {
  const normalized = value
    .replace(/[\/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length > 0 ? normalized : "Untitled video";
};

const normalizeLooseText = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[\s_\-!！?？,.，。:：;；"'`~()（）\[\]{}<>《》【】]/g, "");
};

const resolveVideoOutputDir = (url: string): string => {
  const platform = isBilibiliHost(url) ? "bilibili" : "youtube";
  return path.join(VAULT_DIR, platform === "bilibili" ? "AI/Bilibili" : "AI/YouTube");
};

const findExistingVideoArtifact = (
  url: string,
  metadataTitle: string | null
): ExistingArtifactMatch | null => {
  const outputDir = resolveVideoOutputDir(url);
  let entries: string[] = [];

  try {
    entries = fs.readdirSync(outputDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => path.join(outputDir, name));
  } catch {
    return null;
  }

  for (const artifactPath of entries) {
    try {
      const preview = fs.readFileSync(artifactPath, "utf8").slice(0, 2000);
      if (preview.includes(`source: ${url}`) || preview.includes(`[链接](${url})`)) {
        return {
          artifactPath,
          matchedBy: "source"
        };
      }
    } catch {
      // Keep scanning.
    }
  }

  if (metadataTitle === null || metadataTitle.trim().length === 0) {
    return null;
  }

  const normalizedTitle = normalizeLooseText(metadataTitle);
  for (const artifactPath of entries) {
    const baseName = path.basename(artifactPath, ".md");
    const normalizedBaseName = normalizeLooseText(baseName);
    if (
      normalizedBaseName.length > 0
      && (
        normalizedTitle.startsWith(normalizedBaseName)
        || normalizedBaseName.startsWith(normalizedTitle)
      )
    ) {
      return {
        artifactPath,
        matchedBy: "title"
      };
    }
  }

  return null;
};

const formatUploadDate = (value: string | null): string | null => {
  if (value === null || !/^\d{8}$/.test(value)) {
    return value;
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
};

const writeFallbackVideoNote = async (
  url: string,
  processor: string,
  failureReason: string
): Promise<NoteRunnerResult> => {
  const metadata = await fetchVideoMetadata(url);
  const existingArtifact = findExistingVideoArtifact(metadata.url, metadata.title);
  if (existingArtifact !== null) {
    const preview = readArtifactPreview(existingArtifact.artifactPath);
    return {
      kind: "video",
      processor,
      artifactPath: existingArtifact.artifactPath,
      title: `笔记已接住：${path.basename(existingArtifact.artifactPath)}`,
      useFor: "视频笔记已经落进本地仓库了。先确认内容是否符合预期，再决定要不要继续收紧 skill 契约。",
      knowledgeTag: processor,
      petRemark: "笔记已经写出来了，我直接把现成产物接回来。",
      summaryText: [
        "STATUS: success_recovered",
        `PROCESSOR: ${processor}`,
        `ARTIFACT: ${existingArtifact.artifactPath}`,
        `RECOVERED_BY: ${existingArtifact.matchedBy}`,
        `ERROR: ${failureReason}`,
        preview.length > 0 ? `Preview:\n${preview}` : "Preview unavailable."
      ].join("\n\n"),
      extractionStage: "note_ingested",
      extractionError: failureReason,
      lastError: failureReason
    };
  }

  const platform = isBilibiliHost(metadata.url) ? "bilibili" : "youtube";
  const outputDir = resolveVideoOutputDir(metadata.url);
  fs.mkdirSync(outputDir, { recursive: true });

  const fileName = `${sanitizeNoteName(metadata.title)}.md`;
  const artifactPath = path.join(outputDir, fileName);
  const uploadDate = formatUploadDate(metadata.uploadDate) ?? "unknown";
  const uploader = metadata.uploader ?? "unknown";
  const duration = metadata.duration ?? "unknown";
  const transcriptSource = metadata.subtitleLanguages.length > 0 ? "subtitle_unavailable_to_runner" : "metadata_only";
  const aliyunMissing = (process.env.ALIYUN_API_KEY?.trim() ?? "").length === 0;

  const lines = [
    "---",
    `title: ${metadata.title}`,
    "tags: [video-note, fallback]",
    `source: ${metadata.url}`,
    `author: ${uploader}`,
    `date: ${uploadDate}`,
    `duration: ${duration}`,
    "type: 视频笔记",
    `platform: ${platform}`,
    `transcript_source: ${transcriptSource}`,
    "---",
    "",
    `# ${metadata.title}`,
    "",
    "> [!info] 视频信息",
    `> author: ${uploader}`,
    `> duration: ${duration}`,
    `> date: ${uploadDate}`,
    `> source: ${metadata.url}`,
    "",
    "## 当前状态",
    `- Telegram 已收到并开始处理这条链接。`,
    `- 原始处理器: ${processor}`,
    `- 当前已落地一个兜底笔记，避免整条链路失败。`,
    "",
    "## 为什么走了兜底",
    `- ${failureReason}`,
    ...(metadata.cookieError === null ? [] : [`- 初次抓取失败后已自动重试浏览器 cookies。首个失败原因: ${metadata.cookieError}`]),
    ...(aliyunMissing ? ["- 当前环境未设置 `ALIYUN_API_KEY`，在无字幕视频上无法走 ASR 转录。"] : []),
    "",
    "## 可用元数据摘要",
    ...(metadata.description === null || metadata.description.length === 0
      ? ["- 暂无公开视频简介。"]
      : metadata.description.split("\n").flatMap((line) => line.trim().length === 0 ? [] : [`- ${line.trim()}`])),
    "",
    "## 后续建议",
    ...(metadata.subtitleLanguages.length > 0
      ? [`- 该视频存在字幕语言：${metadata.subtitleLanguages.join(", ")}。后续可继续收敛 skill 输出契约。`]
      : ["- 该视频未探测到可直接使用的字幕。若要完整转录，需要补上 `ALIYUN_API_KEY` 或单独增强 Bilibili 提取链路。"]),
    "",
    "## 原始失败信息",
    "```text",
    failureReason,
    "```"
  ];

  fs.writeFileSync(artifactPath, `${lines.join("\n")}\n`, "utf8");

  const preview = readArtifactPreview(artifactPath);
  return {
    kind: "video",
    processor: `${processor}:fallback`,
    artifactPath,
    title: `笔记已接住：${path.basename(artifactPath)}`,
    useFor: "我已经先把视频笔记落进本地仓库了。先确认内容是否够用，再决定要不要继续补全转录链路。",
    knowledgeTag: processor,
    petRemark: "完整转录没拿到，但链接我没有让它掉地上。",
    summaryText: [
      "STATUS: success_with_fallback",
      `PROCESSOR: ${processor}`,
      `ARTIFACT: ${artifactPath}`,
      `ERROR: ${failureReason}`,
      preview.length > 0 ? `Preview:\n${preview}` : "Preview unavailable."
    ].join("\n\n"),
    extractionStage: "note_ingested",
    extractionError: failureReason,
    lastError: failureReason
  };
};

export const runUrlNoteWorkflow = async (url: string): Promise<NoteRunnerResult> => {
  const resolvedUrl = await expandShortVideoUrl(url);
  const kind = classifyUrlNoteKind(resolvedUrl);
  if (kind === "unknown") {
    return {
      kind,
      processor: "unsupported",
      artifactPath: null,
      title: "链接类型不支持",
      useFor: "这个链接现在还不能走笔记接力链路。先确认它是不是公开视频或普通文章链接。",
      knowledgeTag: "note workflow",
      petRemark: "这次我没接住，不是假装处理完了。",
      summaryText: `Unsupported URL for note workflow: ${resolvedUrl}`,
      extractionStage: "note_failed",
      extractionError: "Unsupported URL type for note workflow.",
      lastError: "Unsupported URL type for note workflow."
    };
  }

  const processor = kind === "video" ? "video-to-note" : "article-to-note";
  const prompt = buildPrompt(resolvedUrl, kind);
  const commandSummary = `${shellQuote(CLAUDE_BIN)} -p --dangerously-skip-permissions <prompt>`;

  try {
    const result = await runClaudePrompt(prompt);
    const artifactPath = parseArtifactPath(result.stdout);
    if (result.exitCode !== 0) {
      const errorText = (result.stderr || result.stdout || `Claude exited with code ${result.exitCode}`).trim();
      if (kind === "video") {
        return await writeFallbackVideoNote(resolvedUrl, processor, errorText);
      }

      return {
        kind,
        processor,
        artifactPath,
        title: `笔记接力失败：${processor}`,
        useFor: "先看失败原因，修正外部依赖或命令契约后再重试这个链接。",
        knowledgeTag: "note workflow",
        petRemark: "我把失败点露出来，别让它悄悄沉下去。",
        summaryText: [
          "STATUS: failed",
          `PROCESSOR: ${processor}`,
          `ARTIFACT: ${artifactPath ?? "missing"}`,
          `ERROR: ${errorText}`,
          `COMMAND: ${commandSummary}`
        ].join("\n"),
        extractionStage: "note_failed",
        extractionError: errorText,
        lastError: errorText
      };
    }

    if (artifactPath === null) {
      if (kind === "video") {
        const details = result.stdout.trim().length > 0
          ? result.stdout.trim()
          : "Claude completed without reporting ARTIFACT path.";
        return await writeFallbackVideoNote(resolvedUrl, processor, details);
      }

      return {
        kind,
        processor,
        artifactPath: null,
        title: `笔记接力失败：${processor}`,
        useFor: "Claude 没有回报产物路径。先修正 skill 输出契约，再重试。",
        knowledgeTag: "note workflow",
        petRemark: "它跑了，但没把产物交回来。",
        summaryText: [
          "STATUS: failed",
          `PROCESSOR: ${processor}`,
          "ARTIFACT: missing",
          "ERROR: Claude completed without reporting ARTIFACT path."
        ].join("\n"),
        extractionStage: "note_failed",
        extractionError: "Claude completed without reporting ARTIFACT path.",
        lastError: "Claude completed without reporting ARTIFACT path."
      };
    }

    const preview = readArtifactPreview(artifactPath);
    return {
      kind,
      processor,
      artifactPath,
      title: `笔记已接住：${path.basename(artifactPath)}`,
      useFor: "先看生成的笔记是否落在预期目录，再决定要不要继续做二次 ingest 或整理。",
      knowledgeTag: processor,
      petRemark: "链接我已经替你送进本地仓库了。",
      summaryText: [
        "STATUS: success",
        `PROCESSOR: ${processor}`,
        `ARTIFACT: ${artifactPath}`,
        preview.length > 0 ? `Preview:\n${preview}` : "Preview unavailable."
      ].join("\n\n"),
      extractionStage: "note_ingested",
      extractionError: null,
      lastError: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown note workflow error.";
    if (kind === "video") {
      return await writeFallbackVideoNote(resolvedUrl, processor, message);
    }

    return {
      kind,
      processor,
      artifactPath: null,
      title: `笔记接力失败：${processor}`,
      useFor: "先修复本地命令或外部依赖，再重新发送这个链接。",
      knowledgeTag: "note workflow",
      petRemark: "我没假装成功，错误我已经留给你了。",
      summaryText: [
        "STATUS: failed",
        `PROCESSOR: ${processor}`,
        "ARTIFACT: missing",
        `ERROR: ${message}`,
        `COMMAND: ${commandSummary}`
      ].join("\n"),
      extractionStage: "note_failed",
      extractionError: message,
      lastError: message
    };
  }
};
