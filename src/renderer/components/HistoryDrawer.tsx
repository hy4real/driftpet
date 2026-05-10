import type { CardRecord } from "../../main/types/card";
import type { ClaudeDispatchUserStatus } from "../../main/types/claude";
import { getClaudeDispatchStatusView } from "../claude-dispatch-view";

type ClaudeDispatchFeedback = {
  cardId: number;
  tone: "success" | "error";
  message: string;
};

type HistoryDrawerProps = {
  cards: CardRecord[];
  isOpen: boolean;
  dispatchingCardId: number | null;
  deletingCardId: number | null;
  updatingDispatchCardId: number | null;
  claudeDispatchFeedback: ClaudeDispatchFeedback | null;
  onClose: () => void;
  onDeleteCard: (card: CardRecord) => void;
  onDispatchClaudeCode: (card: CardRecord) => void;
  onUpdateClaudeDispatchStatus: (card: CardRecord, status: ClaudeDispatchUserStatus) => void;
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

export function HistoryDrawer({
  cards,
  isOpen,
  dispatchingCardId,
  deletingCardId,
  updatingDispatchCardId,
  claudeDispatchFeedback,
  onClose,
  onDeleteCard,
  onDispatchClaudeCode,
  onUpdateClaudeDispatchStatus,
  onSelectCard
}: HistoryDrawerProps) {
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
              <div className="history-card-shell">
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
                <div className="history-card-actions">
                  <button
                    className="ghost-button history-card-action"
                    disabled={dispatchingCardId !== null || deletingCardId !== null}
                    onClick={() => onDispatchClaudeCode(card)}
                    type="button"
                  >
                    {dispatchingCardId === card.id ? "正在派发..." : "派给 Claude Code"}
                  </button>
                  <button
                    className="ghost-button history-card-action history-card-action-danger"
                    disabled={dispatchingCardId !== null || deletingCardId !== null}
                    onClick={() => onDeleteCard(card)}
                    type="button"
                  >
                    {deletingCardId === card.id ? "删除中..." : "删除"}
                  </button>
                </div>
                {(() => {
                  const dispatch = card.latestClaudeDispatch;
                  const dispatchView = getClaudeDispatchStatusView(dispatch);
                  if (dispatch === undefined || dispatch === null || dispatchView === null) {
                    return null;
                  }

                  const showActions = dispatch.status === "launched";
                  const actionsDisabled = dispatchingCardId !== null
                    || deletingCardId !== null
                    || updatingDispatchCardId !== null;

                  return (
                    <div
                      className={`history-card-dispatch-note history-card-dispatch-note-${dispatchView.tone}`}
                      role="status"
                    >
                      <span>{dispatchView.label}</span>
                      {dispatchView.detail !== null ? <small>{dispatchView.detail}</small> : null}
                      {showActions ? (
                        <div className="history-card-dispatch-actions">
                          <button
                            className="ghost-button history-card-dispatch-action"
                            disabled={actionsDisabled}
                            onClick={() => onUpdateClaudeDispatchStatus(card, "done")}
                            type="button"
                          >
                            {updatingDispatchCardId === card.id ? "更新中..." : "标记完成"}
                          </button>
                          <button
                            className="ghost-button history-card-dispatch-action"
                            disabled={actionsDisabled}
                            onClick={() => onUpdateClaudeDispatchStatus(card, "dismissed")}
                            type="button"
                          >
                            收起记录
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
                {claudeDispatchFeedback?.cardId === card.id ? (
                  <p
                    className={`history-card-dispatch-note history-card-dispatch-note-${claudeDispatchFeedback.tone}`}
                    role="status"
                  >
                    {claudeDispatchFeedback.message}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
