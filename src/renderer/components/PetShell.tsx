type PetShellProps = {
  historyOpen: boolean;
  statusOpen: boolean;
  manualText: string;
  onManualTextChange: (value: string) => void;
  onSubmitManualText: () => void;
  onToggleHistory: () => void;
  onToggleStatus: () => void;
  onShowDemo: () => void;
};

export function PetShell({
  historyOpen,
  statusOpen,
  manualText,
  onManualTextChange,
  onSubmitManualText,
  onToggleHistory,
  onToggleStatus,
  onShowDemo
}: PetShellProps) {
  return (
    <section className="pet-shell">
      <div className="pet-core">
        <div className="pet-core-inner">
          <span className="pet-name">driftpet</span>
          <p>You are not where you think you are.</p>
        </div>
      </div>

      <div className="pet-controls">
        <label className="manual-input-shell">
          <span className="manual-input-label">Manual drift note</span>
          <textarea
            className="manual-input"
            onChange={(event) => onManualTextChange(event.target.value)}
            placeholder="Paste what you are doing or where you drifted."
            value={manualText}
          />
        </label>
        <button
          className="pet-button"
          onClick={onToggleHistory}
          type="button"
        >
          {historyOpen ? "hide log" : "show log"}
        </button>
        <button
          className="pet-button"
          onClick={onToggleStatus}
          type="button"
        >
          {statusOpen ? "hide health" : "show health"}
        </button>
        <button
          className="pet-button pet-button-accent"
          onClick={onShowDemo}
          type="button"
        >
          show demo
        </button>
        <button
          className="pet-button pet-button-strong"
          onClick={onSubmitManualText}
          type="button"
        >
          ingest note
        </button>
      </div>
    </section>
  );
}
