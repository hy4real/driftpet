import type { CardRecord } from "../../main/types/card";

type HistoryDrawerProps = {
  cards: CardRecord[];
  isOpen: boolean;
  onClose: () => void;
  onSelectCard: (card: CardRecord) => void;
};

const memoryAgeLabel = (index: number): string => {
  if (index === 0) {
    return "刚刚记住";
  }
  if (index < 3) {
    return "最近陪你看过";
  }

  return "更早的小记忆";
};

export function HistoryDrawer({ cards, isOpen, onClose, onSelectCard }: HistoryDrawerProps) {
  return (
    <aside className={`history-drawer ${isOpen ? "open" : ""}`}>
      <header className="drawer-header">
        <div>
          <p className="bubble-eyebrow">driftpet 记得</p>
          <h2>我替你收着这些。</h2>
        </div>
        <button
          className="ghost-button"
          onClick={onClose}
          type="button"
        >
          返回
        </button>
      </header>

      {cards.length === 0 ? (
        <div className="empty-state">
          <p>我还没记住什么。</p>
          <span>把链接、想法或一段乱糟糟的上下文丢给我，我会慢慢收起来。</span>
        </div>
      ) : (
        <ul className="history-list">
          {cards.map((card, index) => (
            <li key={card.id}>
              <button
                className="history-card"
                onClick={() => onSelectCard(card)}
                type="button"
              >
                <span className="history-memory-age">{memoryAgeLabel(index)}</span>
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
