import type { PetMode } from "../../main/types/status";

type PetShellProps = {
  historyOpen: boolean;
  statusOpen: boolean;
  chaosText: string;
  petMode: PetMode;
  petHourlyBudget: number;
  petShownThisHour: number;
  onChaosTextChange: (value: string) => void;
  onSubmitChaosReset: () => void;
  onSetPetMode: (mode: PetMode) => void;
  onChangePetBudget: (delta: number) => void;
  onToggleHistory: () => void;
  onToggleStatus: () => void;
  onShowDemo: () => void;
};

export function PetShell({
  historyOpen,
  statusOpen,
  chaosText,
  petMode,
  petHourlyBudget,
  petShownThisHour,
  onChaosTextChange,
  onSubmitChaosReset,
  onSetPetMode,
  onChangePetBudget,
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
        <div className="mode-shell">
          <span className="manual-input-label">Mode</span>
          <div className="mode-segmented">
            <button
              className={`mode-button ${petMode === "focus" ? "mode-button-active" : ""}`}
              onClick={() => onSetPetMode("focus")}
              type="button"
            >
              focus
            </button>
            <button
              className={`mode-button ${petMode === "sleep" ? "mode-button-active" : ""}`}
              onClick={() => onSetPetMode("sleep")}
              type="button"
            >
              sleep
            </button>
          </div>
        </div>

        <div className="budget-shell">
          <span className="manual-input-label">Hourly budget</span>
          <div className="budget-stepper">
            <button
              className="budget-button"
              onClick={() => onChangePetBudget(-1)}
              type="button"
            >
              -
            </button>
            <div className="budget-value">
              <strong>{petHourlyBudget}</strong>
              <span>{petShownThisHour} shown</span>
            </div>
            <button
              className="budget-button"
              onClick={() => onChangePetBudget(1)}
              type="button"
            >
              +
            </button>
          </div>
        </div>

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
