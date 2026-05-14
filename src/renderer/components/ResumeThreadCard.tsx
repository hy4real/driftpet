import type { CardRecord } from "../../main/types/card";
import { parseUseFor } from "./parse-use-for";

type ResumeThreadCardProps = {
  card: CardRecord;
  onResume: () => void;
  onCollapse: () => void;
};

export function ResumeThreadCard({ card, onResume, onCollapse }: ResumeThreadCardProps) {
  const parsed = parseUseFor(card.useFor);
  const showSetAside = parsed.setAside !== null && parsed.setAside.length > 0;
  const showNextStep = parsed.nextStep.length > 0;

  return (
    <article className="pet-resume-card" aria-label="driftpet 正在守着的工作记忆">
      <header className="pet-resume-card-header">
        <span className="pet-resume-card-eyebrow">正在守着的线</span>
        <h2 className="pet-resume-card-title">{card.title}</h2>
      </header>

      {showNextStep ? (
        <section className="pet-resume-card-row">
          <span className="pet-resume-card-row-label" aria-hidden="true">⏭</span>
          <div className="pet-resume-card-row-body">
            <span className="pet-resume-card-row-eyebrow">接线下一手</span>
            <p>{parsed.nextStep}</p>
          </div>
        </section>
      ) : null}

      {showSetAside ? (
        <section className="pet-resume-card-row pet-resume-card-row-muted">
          <span className="pet-resume-card-row-label" aria-hidden="true">⏸</span>
          <div className="pet-resume-card-row-body">
            <span className="pet-resume-card-row-eyebrow">先别碰</span>
            <p>{parsed.setAside}</p>
          </div>
        </section>
      ) : null}

      <footer className="pet-resume-card-actions">
        <button
          className="pet-resume-card-primary"
          onClick={onResume}
          type="button"
        >
          接回这条
        </button>
        <button
          className="pet-resume-card-secondary"
          onClick={onCollapse}
          type="button"
        >
          收起
        </button>
      </footer>
    </article>
  );
}
