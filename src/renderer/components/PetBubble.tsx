import type { CardRecord } from "../../main/types/card";

type PetBubbleProps = {
  card: CardRecord | null;
  onClose: () => void;
};

export function PetBubble({ card, onClose }: PetBubbleProps) {
  if (card === null) {
    return null;
  }

  return (
    <article className="bubble-panel">
      <header className="bubble-header">
        <div>
          <p className="bubble-eyebrow">driftpet noticed</p>
          <h1>{card.title}</h1>
        </div>
        <button
          className="ghost-button"
          onClick={onClose}
          type="button"
        >
          hide
        </button>
      </header>

      <section className="bubble-section">
        <span className="bubble-label">Use now</span>
        <p>{card.useFor}</p>
      </section>

      <section className="bubble-meta">
        <div>
          <span className="bubble-label">Knowledge</span>
          <p>{card.knowledgeTag}</p>
        </div>
        <div>
          <span className="bubble-label">Remark</span>
          <p>{card.petRemark}</p>
        </div>
      </section>

      {card.related.length > 0 ? (
        <section className="bubble-section">
          <span className="bubble-label">Related memory</span>
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
