type PetShellProps = {
  historyOpen: boolean;
  statusOpen: boolean;
  chaosText: string;
  onChaosTextChange: (value: string) => void;
  onSubmitChaosReset: () => void;
  onToggleHistory: () => void;
  onToggleStatus: () => void;
  onShowDemo: () => void;
};

export function PetShell({
  historyOpen,
  statusOpen,
  chaosText,
  onChaosTextChange,
  onSubmitChaosReset,
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
          <span className="manual-input-label">I&apos;m drifting</span>
          <textarea
            className="manual-input"
            onChange={(event) => onChaosTextChange(event.target.value)}
            placeholder="Paste the current task, open tabs, links, and where the thread got messy."
            value={chaosText}
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
          onClick={onSubmitChaosReset}
          type="button"
        >
          reset thread
        </button>
      </div>
    </section>
  );
}
