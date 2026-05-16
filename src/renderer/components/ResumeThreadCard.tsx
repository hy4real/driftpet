import type { CardRecord } from "../../main/types/card";
import { getThreadWaitingReminder } from "../thread-cache-waiting";
import { parseUseFor } from "./parse-use-for";

type ResumeThreadCardProps = {
  card: CardRecord;
  onResume: () => void;
  onRelease: () => void;
};

export function ResumeThreadCard({ card, onResume, onRelease }: ResumeThreadCardProps) {
  const parsed = parseUseFor(card.useFor);
  const showSetAside = parsed.setAside !== null && parsed.setAside.length > 0;
  const showNextStep = parsed.nextStep.length > 0;
  const cache = card.threadCache;
  const waitingReminder = getThreadWaitingReminder(card);
  const waitingLabel = waitingReminder.age === "cooling"
    ? "等了一阵"
    : waitingReminder.age === "cold"
      ? "别再干等"
      : "正在等";
  const releaseLabel = waitingReminder.state === "active" && waitingReminder.age === "cold"
    ? "先放下这条"
    : "放下这条";
  const summary = cache?.workingJudgment ?? null;
  const nextMove = cache?.nextMove ?? (showNextStep ? parsed.nextStep : null);
  const setAside = cache?.sideThread ?? (showSetAside ? parsed.setAside : null);
  const avoid = cache?.ruledOut ?? null;

  return (
    <article className="pet-resume-card" aria-label="driftpet 正在守着的工作记忆">
      <header className="pet-resume-card-header">
        <span className="pet-resume-card-eyebrow">正在守着的线</span>
        <h2 className="pet-resume-card-title">{card.title}</h2>
      </header>

      <div className="pet-resume-card-body">
        {cache !== null ? (
          <>
            <section className="pet-resume-card-row">
              <span className="pet-resume-card-row-label" aria-hidden="true">◎</span>
              <div className="pet-resume-card-row-body">
                <span className="pet-resume-card-row-eyebrow">正在追</span>
                <p>{cache.chasing}</p>
              </div>
            </section>

            {summary !== null ? (
              <section className="pet-resume-card-row">
                <span className="pet-resume-card-row-label" aria-hidden="true">→</span>
                <div className="pet-resume-card-row-body">
                  <span className="pet-resume-card-row-eyebrow">现在先做</span>
                  <p>{summary}</p>
                  {nextMove !== null && nextMove !== summary ? (
                    <small>{nextMove}</small>
                  ) : null}
                </div>
              </section>
            ) : null}

            {waitingReminder.state === "active" ? (
              <section className="pet-resume-card-row pet-resume-card-row-waiting">
                <span className="pet-resume-card-row-label" aria-hidden="true">⌛</span>
                <div className="pet-resume-card-row-body">
                  <span className="pet-resume-card-row-eyebrow">{waitingLabel}</span>
                  <p>{waitingReminder.waitingOn}</p>
                  {waitingReminder.meanwhile !== null ? (
                    <small>{waitingReminder.age === "cold" ? "先做别的：" : "先推进："}{waitingReminder.meanwhile}</small>
                  ) : null}
                </div>
              </section>
            ) : null}

            {waitingReminder.state === "resolved" && waitingReminder.age === "resolved_fresh" ? (
              <section className="pet-resume-card-row pet-resume-card-row-warm">
                <span className="pet-resume-card-row-label" aria-hidden="true">✓</span>
                <div className="pet-resume-card-row-body">
                  <span className="pet-resume-card-row-eyebrow">等回来了</span>
                  <p>可以直接顺着这条线往下做了。</p>
                </div>
              </section>
            ) : null}

            {setAside !== null || avoid !== null ? (
              <section className="pet-resume-card-row pet-resume-card-row-muted">
                <span className="pet-resume-card-row-label" aria-hidden="true">⏸</span>
                <div className="pet-resume-card-row-body">
                  <span className="pet-resume-card-row-eyebrow">先别碰</span>
                  <p>{setAside ?? avoid}</p>
                  {setAside !== null && avoid !== null ? (
                    <small>{avoid}</small>
                  ) : null}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <>
            {nextMove !== null ? (
              <section className="pet-resume-card-row">
                <span className="pet-resume-card-row-label" aria-hidden="true">→</span>
                <div className="pet-resume-card-row-body">
                  <span className="pet-resume-card-row-eyebrow">现在先做</span>
                  <p>{nextMove}</p>
                </div>
              </section>
            ) : null}

            {setAside !== null ? (
              <section className="pet-resume-card-row pet-resume-card-row-muted">
                <span className="pet-resume-card-row-label" aria-hidden="true">⏸</span>
                <div className="pet-resume-card-row-body">
                  <span className="pet-resume-card-row-eyebrow">先别碰</span>
                  <p>{setAside}</p>
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>

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
          onClick={onRelease}
          type="button"
        >
          {releaseLabel}
        </button>
      </footer>
    </article>
  );
}
