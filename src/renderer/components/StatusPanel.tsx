import { useState } from "react";
import type { AppStatus, StatusSection } from "../../main/types/status";

type StatusPanelProps = {
  isOpen: boolean;
  status: AppStatus | null;
  onClose: () => void;
  onRefresh: () => void;
};

const statusLabel = (section: StatusSection): string => {
  if (section.level === "ok") {
    return "正常";
  }

  if (section.level === "warn") {
    return "警告";
  }

  return "待机";
};

const formatCheckedAt = (value: number): string => {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
};

const summarize = (value: string, limit: number): string => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 3)}...`;
};

const extractionLabel = (state: "not_applicable" | "fallback" | "extracted" | "failed"): string => {
  if (state === "extracted") {
    return "已提取";
  }

  if (state === "fallback") {
    return "降级提取";
  }

  if (state === "failed") {
    return "提取失败";
  }

  return "不适用";
};

const telegramResultLabel = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }

  if (value === "created_or_updated_card") {
    return "已生成或更新卡片";
  }

  if (value === "dedup_reused_existing_card") {
    return "命中去重，复用已有卡片";
  }

  if (value === "ignored_empty_text_or_caption") {
    return "消息已收到，但正文为空";
  }

  return value;
};

export function StatusPanel({ isOpen, status, onClose, onRefresh }: StatusPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const lastTelegramResult = status?.telegram.lastProcessedResult ?? null;

  return (
    <aside className={`status-panel ${isOpen ? "open" : ""}`}>
      <header className="status-panel-header">
        <div>
          <p className="bubble-eyebrow">driftpet 状态</p>
          <h2>看看它今天精神好不好。</h2>
        </div>
        <div className="panel-actions">
          <button
            className="ghost-button"
            onClick={onRefresh}
            type="button"
          >
            刷新
          </button>
          <button
            className="ghost-button"
            onClick={onClose}
            type="button"
          >
            返回
          </button>
        </div>
      </header>

      {status === null ? (
        <div className="status-empty">
          <p>正在加载状态...</p>
        </div>
      ) : (
        <>
          <div className="status-grid status-grid-primary">
            <article className={`status-card status-${status.pet.level}`}>
              <div className="status-card-head">
                <strong>桌宠</strong>
                <span>{statusLabel(status.pet)}</span>
              </div>
              <p>{status.pet.summary}</p>
              <small>{status.pet.detail}</small>
            </article>
          </div>

          <button
            className="status-details-toggle"
            onClick={() => setDetailsOpen((open) => !open)}
            type="button"
          >
            {detailsOpen ? "收起详细状态" : "看看详细状态"}
          </button>

          {detailsOpen ? (
            <div className="status-grid">
              <article className={`status-card status-${status.telegram.level}`}>
              <div className="status-card-head">
                <strong>手机入口</strong>
                <span>{statusLabel(status.telegram)}</span>
              </div>
              <p>{status.telegram.summary}</p>
              <small>{status.telegram.detail}</small>
              <small>{`poller · ${status.telegram.pollerState}`}</small>
              {status.telegram.lastError !== null ? (
                <small>{summarize(status.telegram.lastError, 180)}</small>
              ) : null}
              {lastTelegramResult !== null ? (
                <>
                  <small>{`last update · ${lastTelegramResult.updateId}`}</small>
                  {lastTelegramResult.cardTitle !== null ? (
                    <small>{summarize(lastTelegramResult.cardTitle, 180)}</small>
                  ) : null}
                  {lastTelegramResult.rawUrl !== null ? (
                    <small>{summarize(lastTelegramResult.rawUrl, 180)}</small>
                  ) : null}
                  {telegramResultLabel(lastTelegramResult.note) !== null ? (
                    <small>{`result · ${telegramResultLabel(lastTelegramResult.note)}`}</small>
                  ) : null}
                  {lastTelegramResult.artifactPath !== undefined && lastTelegramResult.artifactPath !== null ? (
                    <small>{summarize(lastTelegramResult.artifactPath, 180)}</small>
                  ) : null}
                </>
              ) : null}
            </article>

              <article className={`status-card status-${status.llm.level}`}>
              <div className="status-card-head">
                <strong>整理脑袋</strong>
                <span>{statusLabel(status.llm)}</span>
              </div>
              <p>{status.llm.summary}</p>
              <small>{status.llm.detail}</small>
            </article>

              <article className={`status-card status-${status.embeddings.level}`}>
              <div className="status-card-head">
                <strong>记忆索引</strong>
                <span>{statusLabel(status.embeddings)}</span>
              </div>
              <p>{status.embeddings.summary}</p>
              <small>{status.embeddings.detail}</small>
            </article>

              <article className={`status-card status-${status.storage.level}`}>
              <div className="status-card-head">
                <strong>小仓库</strong>
                <span>{statusLabel(status.storage)}</span>
              </div>
              <p>{status.storage.summary}</p>
              <small>{status.storage.detail}</small>
            </article>
            </div>
          ) : null}

          {detailsOpen && status.storage.latestItem !== null ? (
            <section className="capture-panel">
              <header className="capture-panel-header">
                <strong>最近收下的东西</strong>
                <span>
                  #{status.storage.latestItem.id} · {status.storage.latestItem.origin}
                </span>
              </header>

              <div className="capture-block">
                <span className="bubble-label">原始小纸条</span>
                <p>{status.storage.latestItem.title}</p>
                <small>
                  {status.storage.latestItem.source} · {status.storage.latestItem.status}
                  {` · ${status.storage.latestItem.origin}`}
                  {status.storage.latestItem.tgMessageId !== null ? ` · ${status.storage.latestItem.tgMessageId}` : ""}
                </small>
              </div>

              {status.storage.latestItem.extraction.hasUrl ? (
                <div className={`capture-block ${status.storage.latestItem.extraction.extractionState === "fallback" || status.storage.latestItem.extraction.extractionState === "failed" ? "capture-block-warn" : ""}`}>
                  <span className="bubble-label">读链接</span>
                  <p>{status.storage.latestItem.extraction.rawUrl}</p>
                  <small>
                    {extractionLabel(status.storage.latestItem.extraction.extractionState)}
                    {` · ${status.storage.latestItem.extraction.stage}`}
                  </small>
                  {status.storage.latestItem.extraction.detail !== null ? (
                    <small>{summarize(status.storage.latestItem.extraction.detail, 180)}</small>
                  ) : null}
                  {status.storage.latestItem.extraction.processor !== null ? (
                    <small>{`processor · ${status.storage.latestItem.extraction.processor}`}</small>
                  ) : null}
                  {status.storage.latestItem.extraction.artifactPath !== null ? (
                    <small>{summarize(status.storage.latestItem.extraction.artifactPath, 180)}</small>
                  ) : null}
                  {status.storage.latestItem.extraction.extractedTextPreview !== null ? (
                    <small>{status.storage.latestItem.extraction.extractedTextPreview}</small>
                  ) : null}
                </div>
              ) : null}

              {status.storage.latestItem.lastError !== null && status.storage.latestItem.lastError !== status.storage.latestItem.extraction.detail ? (
                <div className="capture-block capture-block-warn">
                  <span className="bubble-label">错误</span>
                  <p>{summarize(status.storage.latestItem.lastError, 180)}</p>
                </div>
              ) : null}

              {status.storage.latestItem.card !== null ? (
                <>
                  <div className="capture-block">
                    <span className="bubble-label">整理后的小纸条</span>
                    <p>{status.storage.latestItem.card.title}</p>
                    <small>{status.storage.latestItem.card.knowledgeTag}</small>
                  </div>

                  <div className="capture-block">
                    <span className="bubble-label">接线下一手</span>
                    <p>{summarize(status.storage.latestItem.card.threadCache?.nextMove ?? status.storage.latestItem.card.useFor, 180)}</p>
                  </div>

                  {status.storage.latestItem.card.threadCache !== null ? (
                    <div className="capture-block">
                      <span className="bubble-label">正在追</span>
                      <p>{summarize(status.storage.latestItem.card.threadCache.chasing, 180)}</p>
                    </div>
                  ) : null}

                  <div className="capture-block">
                    <span className="bubble-label">driftpet 悄悄说</span>
                    <p>{status.storage.latestItem.card.petRemark}</p>
                  </div>

                  {status.storage.latestItem.card.related.length > 0 ? (
                    <div className="capture-block">
                      <span className="bubble-label">它想起了这些</span>
                      <ul className="capture-related-list">
                        {status.storage.latestItem.card.related.map((related) => (
                          <li key={related.cardId}>
                            <strong>{related.title}</strong>
                            <span>{related.reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="capture-block">
                  <span className="bubble-label">小纸条</span>
                  <p>还没整理出来。</p>
                </div>
              )}
            </section>
          ) : null}

          <footer className="status-footer">
            <span>检查时间 {formatCheckedAt(status.checkedAt)}</span>
            {status.storage.latestItem !== null ? (
              <span>最新 #{status.storage.latestItem.id}</span>
            ) : (
              <span>尚无条目</span>
            )}
          </footer>
        </>
      )}
    </aside>
  );
}
