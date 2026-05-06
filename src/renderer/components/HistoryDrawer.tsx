import type { CardRecord } from "../../main/types/card";

type HistoryDrawerProps = {
  cards: CardRecord[];
  isOpen: boolean;
  onSelectCard: (card: CardRecord) => void;
};

export function HistoryDrawer({ cards, isOpen, onSelectCard }: HistoryDrawerProps) {
  return (
    <aside className={`history-drawer ${isOpen ? "open" : ""}`}>
      <header className="drawer-header">
        <div>
          <p className="bubble-eyebrow">recent cards</p>
          <h2>Memory drift log</h2>
        </div>
      </header>

      {cards.length === 0 ? (
        <div className="empty-state">
          <p>No cards yet.</p>
          <span>Run the demo and the first card will land here.</span>
        </div>
      ) : (
        <ul className="history-list">
          {cards.map((card) => (
            <li key={card.id}>
              <button
                className="history-card"
                onClick={() => onSelectCard(card)}
                type="button"
              >
                <strong>{card.title}</strong>
                <span>{card.knowledgeTag}</span>
                <p>{card.petRemark}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
