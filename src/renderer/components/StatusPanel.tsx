import type { AppStatus, StatusSection } from "../../main/types/status";

type StatusPanelProps = {
  isOpen: boolean;
  status: AppStatus | null;
  onRefresh: () => void;
};

const statusLabel = (section: StatusSection): string => {
  if (section.level === "ok") {
    return "ok";
  }

  if (section.level === "warn") {
    return "warn";
  }

  return "idle";
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
    return "extracted";
  }

  if (state === "fallback") {
    return "fallback";
  }

  if (state === "failed") {
    return "failed";
  }

  return "n/a";
};

export function StatusPanel({ isOpen, status, onRefresh }: StatusPanelProps) {
  return (
    <aside className={`status-panel ${isOpen ? "open" : ""}`}>
      <header className="status-panel-header">
        <div>
          <p className="bubble-eyebrow">system health</p>
          <h2>Can driftpet still digest?</h2>
        </div>
        <button
          className="ghost-button"
          onClick={onRefresh}
          type="button"
        >
          refresh
        </button>
      </header>

      {status === null ? (
        <div className="status-empty">
          <p>Loading status...</p>
        </div>
      ) : (
        <>
          <div className="status-grid">
            <article className={`status-card status-${status.pet.level}`}>
              <div className="status-card-head">
                <strong>Pet</strong>
                <span>{statusLabel(status.pet)}</span>
              </div>
              <p>{status.pet.summary}</p>
              <small>{status.pet.detail}</small>
            </article>

            <article className={`status-card status-${status.telegram.level}`}>
              <div className="status-card-head">
                <strong>Telegram</strong>
                <span>{statusLabel(status.telegram)}</span>
              </div>
              <p>{status.telegram.summary}</p>
              <small>{status.telegram.detail}</small>
            </article>

            <article className={`status-card status-${status.llm.level}`}>
              <div className="status-card-head">
                <strong>LLM</strong>
                <span>{statusLabel(status.llm)}</span>
              </div>
              <p>{status.llm.summary}</p>
              <small>{status.llm.detail}</small>
            </article>

            <article className={`status-card status-${status.embeddings.level}`}>
              <div className="status-card-head">
                <strong>Embeddings</strong>
                <span>{statusLabel(status.embeddings)}</span>
              </div>
              <p>{status.embeddings.summary}</p>
              <small>{status.embeddings.detail}</small>
            </article>

            <article className={`status-card status-${status.storage.level}`}>
              <div className="status-card-head">
                <strong>Storage</strong>
                <span>{statusLabel(status.storage)}</span>
              </div>
              <p>{status.storage.summary}</p>
              <small>{status.storage.detail}</small>
            </article>
          </div>

          {status.storage.latestItem !== null ? (
            <section className="capture-panel">
              <header className="capture-panel-header">
                <strong>Latest capture</strong>
                <span>
                  #{status.storage.latestItem.id} · {status.storage.latestItem.origin}
                </span>
              </header>

              <div className="capture-block">
                <span className="bubble-label">Input</span>
                <p>{status.storage.latestItem.title}</p>
                <small>
                  {status.storage.latestItem.source} · {status.storage.latestItem.status}
                  {` · ${status.storage.latestItem.origin}`}
                  {status.storage.latestItem.tgMessageId !== null ? ` · ${status.storage.latestItem.tgMessageId}` : ""}
                </small>
              </div>

              {status.storage.latestItem.extraction.hasUrl ? (
                <div className={`capture-block ${status.storage.latestItem.extraction.extractionState === "fallback" || status.storage.latestItem.extraction.extractionState === "failed" ? "capture-block-warn" : ""}`}>
                  <span className="bubble-label">Extraction</span>
                  <p>{status.storage.latestItem.extraction.rawUrl}</p>
                  <small>
                    {extractionLabel(status.storage.latestItem.extraction.extractionState)}
                    {` · ${status.storage.latestItem.extraction.stage}`}
                  </small>
                  {status.storage.latestItem.extraction.detail !== null ? (
                    <small>{summarize(status.storage.latestItem.extraction.detail, 180)}</small>
                  ) : null}
                  {status.storage.latestItem.extraction.extractedTextPreview !== null ? (
                    <small>{status.storage.latestItem.extraction.extractedTextPreview}</small>
                  ) : null}
                </div>
              ) : null}

              {status.storage.latestItem.lastError !== null && status.storage.latestItem.lastError !== status.storage.latestItem.extraction.detail ? (
                <div className="capture-block capture-block-warn">
                  <span className="bubble-label">Error</span>
                  <p>{summarize(status.storage.latestItem.lastError, 180)}</p>
                </div>
              ) : null}

              {status.storage.latestItem.card !== null ? (
                <>
                  <div className="capture-block">
                    <span className="bubble-label">Card</span>
                    <p>{status.storage.latestItem.card.title}</p>
                    <small>{status.storage.latestItem.card.knowledgeTag}</small>
                  </div>

                  <div className="capture-block">
                    <span className="bubble-label">Next move</span>
                    <p>{summarize(status.storage.latestItem.card.useFor, 180)}</p>
                  </div>

                  <div className="capture-block">
                    <span className="bubble-label">Remark</span>
                    <p>{status.storage.latestItem.card.petRemark}</p>
                  </div>

                  {status.storage.latestItem.card.related.length > 0 ? (
                    <div className="capture-block">
                      <span className="bubble-label">Related</span>
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
                  <span className="bubble-label">Card</span>
                  <p>No card generated yet.</p>
                </div>
              )}
            </section>
          ) : null}

          <footer className="status-footer">
            <span>checked {formatCheckedAt(status.checkedAt)}</span>
            {status.storage.latestItem !== null ? (
              <span>latest #{status.storage.latestItem.id}</span>
            ) : (
              <span>no items yet</span>
            )}
          </footer>
        </>
      )}
    </aside>
  );
}
