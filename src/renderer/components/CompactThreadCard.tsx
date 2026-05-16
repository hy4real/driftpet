import type { CardRecord } from "../../main/types/card";
import type { RememberedThread } from "../../main/types/status";
import {
  formatGuardedThreadActionLabel,
  getGuardedThreadAgeState,
  getGuardedThreadExpiresWhen,
  getGuardedThreadNextMove,
  getGuardedThreadProgress,
  getGuardedThreadTitle,
  guardedThreadVerbByAge,
} from "../guarded-thread";
import { getThreadWaitingReminder } from "../thread-cache-waiting";
import { parseUseFor } from "./parse-use-for";

type CompactThreadCardProps = {
  card: CardRecord;
  rememberedThread: RememberedThread | null;
  closeLabel: string;
  onClose: () => void;
};

type InfoRow = {
  eyebrow: string;
  body: string;
  tone?: "default" | "muted" | "warm";
};

const buildRows = (card: CardRecord): InfoRow[] => {
  const parsed = parseUseFor(card.useFor);
  const cache = card.threadCache;

  if (cache !== null) {
    const waitingReminder = getThreadWaitingReminder(card);
    const waitingOn = waitingReminder.waitingOn;
    const meanwhile = waitingReminder.meanwhile;
    const waitingLabel = waitingReminder.age === "cooling"
      ? "等了一阵"
      : waitingReminder.age === "cold"
        ? "别再干等"
        : "正在等";
    const rows: InfoRow[] = [
      ...(waitingOn !== null ? [{
        eyebrow: waitingLabel,
        body: waitingOn,
        tone: "muted" as const,
      }] : []),
      ...(waitingReminder.state === "resolved" && waitingReminder.age === "resolved_fresh" ? [{
        eyebrow: "已接回",
        body: "结果已经记回来了，可以直接顺着这条线继续做。",
        tone: "warm" as const,
      }] : []),
      {
        eyebrow: waitingOn !== null
          ? waitingReminder.age === "cold"
            ? "先做别的"
            : "先推进"
          : waitingReminder.state === "resolved" && waitingReminder.age === "resolved_fresh"
            ? "接着做"
            : "下一步",
        body: meanwhile ?? cache.nextMove,
        tone: "warm",
      },
    ];

    if (waitingOn === null) {
      rows.unshift({
        eyebrow: "先放下",
        body: cache.sideThread ?? "没有明确旁路要先挂起，就别再来回切。",
        tone: cache.sideThread !== null ? "muted" : "default",
      });
    } else if (cache.sideThread !== null && cache.sideThread !== waitingOn) {
      rows.push({
        eyebrow: "先别碰",
        body: cache.sideThread,
        tone: "muted",
      });
    }

    if (cache.workingJudgment !== null) {
      rows.push({
        eyebrow: "当前判断",
        body: cache.workingJudgment,
      });
    }

    if (cache.ruledOut !== null) {
      rows.push({
        eyebrow: "别再走",
        body: cache.ruledOut,
        tone: "muted",
      });
    }

    return rows;
  }

  const rows: InfoRow[] = [];
  if (parsed.setAside !== null) {
    rows.push({
      eyebrow: "先放下",
      body: parsed.setAside,
      tone: "muted",
    });
  }

  if (parsed.nextStep.length > 0) {
    rows.push({
      eyebrow: "下一步",
      body: parsed.nextStep,
      tone: "warm",
    });
  }

  return rows;
};

export function CompactThreadCard({ card, rememberedThread, closeLabel, onClose }: CompactThreadCardProps) {
  const now = Date.now();
  const ageState = getGuardedThreadAgeState(rememberedThread?.createdAt ?? card.createdAt, now);
  const title = getGuardedThreadTitle(card, rememberedThread) ?? card.title;
  const action = formatGuardedThreadActionLabel(
    ageState,
    getGuardedThreadNextMove(card),
    getGuardedThreadExpiresWhen(card),
    56
  );
  const progress = getGuardedThreadProgress(rememberedThread?.createdAt ?? card.createdAt, now);
  const rows = buildRows(card);

  return (
    <article className="compact-thread-card" aria-label="当前守线详情">
      <div className="compact-thread-card-pull" aria-hidden="true" />
      <header className="compact-thread-card-header">
        <div className="compact-thread-card-heading">
          <div className="compact-thread-card-topline">
            <span className="compact-thread-card-eyebrow">接回这条线</span>
            <span className={`compact-thread-card-age compact-thread-card-age-${ageState}`}>
              {guardedThreadVerbByAge[ageState]}
            </span>
          </div>
          <h1 className="compact-thread-card-title">{title}</h1>
          <p className="compact-thread-card-meta">
            {action}
          </p>
        </div>
        <button
          className="compact-thread-card-close"
          onClick={onClose}
          type="button"
        >
          {closeLabel}
        </button>
      </header>

      <div
        className={`compact-thread-card-progress compact-thread-card-progress-${ageState}`}
        aria-hidden="true"
      >
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>

      <div className="compact-thread-card-body">
        {rows.map((row) => (
          <section
            key={`${row.eyebrow}:${row.body}`}
            className={`compact-thread-card-row compact-thread-card-row-${row.tone ?? "default"}`}
          >
            <span className="compact-thread-card-row-eyebrow">{row.eyebrow}</span>
            <p>{row.body}</p>
          </section>
        ))}
      </div>

      <footer className="compact-thread-card-footer">
        <div className="compact-thread-card-footer-meta">
          <span className="compact-thread-card-tag">{card.knowledgeTag}</span>
          <p className="compact-thread-card-note">{card.petRemark}</p>
        </div>
      </footer>
    </article>
  );
}
