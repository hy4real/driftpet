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
