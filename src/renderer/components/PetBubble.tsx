import { useEffect, useState } from "react";
import type { CardRecord } from "../../main/types/card";

type PetBubbleProps = {
  card: CardRecord | null;
  note: string | null;
  onClose: () => void;
  windowMode: "mini" | "compact" | "expanded";
};

type IdleCopy = {
  eyebrow: string;
  title: string;
  body: string;
  metaLabel: string;
  metaValue: string;
};

const idleCopies: IdleCopy[] = [
  {
    eyebrow: "driftpet 竖着耳朵",
    title: "我在这里陪你。",
    body: "有东西想记就丢给我；没事的时候，我就安静趴在桌面上。",
    metaLabel: "姿态",
    metaValue: "陪伴中"
  },
  {
    eyebrow: "driftpet 来回踱步",
    title: "要不要把脑子放松一下？",
    body: "你可以先把乱七八糟的东西倒给我，我慢慢帮你收着。",
    metaLabel: "姿态",
    metaValue: "散步中"
  },
  {
    eyebrow: "driftpet 盯着你",
    title: "你不用现在就把一切想清楚。",
    body: "先陪你待一会儿。需要我帮忙时，再把内容丢过来就行。",
    metaLabel: "姿态",
    metaValue: "发呆中"
  }
];

export function PetBubble({ card, note, onClose, windowMode }: PetBubbleProps) {
  const [idleIndex, setIdleIndex] = useState(0);
  const idleCopy = idleCopies[idleIndex % idleCopies.length];
  const displayTitle = note ?? idleCopy.title;
  const displayBody = note ?? idleCopy.body;

  useEffect(() => {
    if (card !== null) {
      return;
    }

    const timer = setInterval(() => {
      setIdleIndex((current) => (current + 1) % idleCopies.length);
    }, 5200);

    return () => {
      clearInterval(timer);
    };
  }, [card, idleCopies.length]);

  return (
    <article className={`bubble-panel bubble-panel-${windowMode} ${card === null ? "bubble-panel-idle" : ""}`}>
      <header className="bubble-header">
        <div>
          <p className="bubble-eyebrow">{card === null ? idleCopy.eyebrow : "driftpet 叼来一张小纸条"}</p>
          <h1>{card === null ? displayTitle : card.title}</h1>
        </div>
        {card !== null ? (
          <button
            className="ghost-button"
            onClick={onClose}
            type="button"
          >
            hide
          </button>
        ) : null}
      </header>

      <section className="bubble-section">
        <span className="bubble-label">{card === null ? "现在的我" : "我觉得可以先这样"}</span>
        <p>{card === null ? displayBody : card.useFor}</p>
      </section>

      <section className="bubble-meta">
        <div>
          <span className="bubble-label">{card === null ? idleCopy.metaLabel : "我帮你贴的标签"}</span>
          <p>{card === null ? idleCopy.metaValue : card.knowledgeTag}</p>
        </div>
        <div>
          <span className="bubble-label">{card === null ? "提示" : "悄悄说"}</span>
          <p>{card === null ? "戳我一下，我会回应你；需要整理时再打开小窝。" : card.petRemark}</p>
        </div>
      </section>

      {card !== null && card.related.length > 0 ? (
        <section className="bubble-section">
          <span className="bubble-label">我想起了这些</span>
          <ul className="related-list">
            {card.related.map((related) => (
              <li key={related.cardId}>
                <strong>{related.title}</strong>
                <span>{related.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
