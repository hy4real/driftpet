import { useState } from "react";
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
  recentlyReleasedCardId: number | null;
  dispatchingCardId: number | null;
  deletingCardId: number | null;
  updatingDispatchCardId: number | null;
  capturingDispatchResultCardId: number | null;
  claudeDispatchFeedback: ClaudeDispatchFeedback | null;
  onClose: () => void;
  onDeleteCard: (card: CardRecord) => void;
  onRecoverWorkline: (card: CardRecord) => void;
  onDispatchClaudeCode: (card: CardRecord) => void;
  onUpdateClaudeDispatchStatus: (card: CardRecord, status: ClaudeDispatchUserStatus) => void;
  onCaptureClaudeDispatchResult: (card: CardRecord, resultSummary: string) => void;
  onSelectCard: (card: CardRecord) => void;
};

const summarizeHistoryCard = (card: CardRecord): string =>
  card.threadCache?.nextMove
  ?? card.threadCache?.chasing
  ?? card.petRemark
  ?? card.useFor;

const memoryAgeLabel = (index: number): string => {
  if (index === 0) {
    return "刚刚记住";
  }
  if (index < 3) {
    return "最近陪你看过";
  }

  return "更早的小记忆";
};

const historyMemoryLabel = (card: CardRecord, index: number, recentlyReleasedCardId: number | null): string => {
  if (recentlyReleasedCardId === card.id) {
    return "刚放下";
  }
  return memoryAgeLabel(index);
};

export function HistoryDrawer({
  cards,
  isOpen,
  recentlyReleasedCardId,
  dispatchingCardId,
  deletingCardId,
  updatingDispatchCardId,
  capturingDispatchResultCardId,
  claudeDispatchFeedback,
  onClose,
  onDeleteCard,
  onRecoverWorkline,
  onDispatchClaudeCode,
  onUpdateClaudeDispatchStatus,
  onCaptureClaudeDispatchResult,
  onSelectCard
}: HistoryDrawerProps) {
  const [resultEditorCardId, setResultEditorCardId] = useState<number | null>(null);

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
          {cards.map((card, index) => {
            const canRecover = card.lifecycleStatus === "dropped"
              && card.recoverUntil !== null
              && card.recoverUntil >= Date.now();

            return (
            <li key={card.id}>
              <div className="history-card-shell">
                <button
                  className="history-card"
                  onClick={() => onSelectCard(card)}
                  type="button"
                >
                  <span className="history-memory-age">
                    {historyMemoryLabel(card, index, recentlyReleasedCardId)}
                  </span>
                  <strong>{card.title}</strong>
                  <p>{summarizeHistoryCard(card)}</p>
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
                  {canRecover ? (
                    <button
                      className="ghost-button history-card-action"
                      disabled={dispatchingCardId !== null || deletingCardId !== null}
                      onClick={() => onRecoverWorkline(card)}
                      type="button"
                    >
                      需要时找回
                    </button>
                  ) : null}
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
                  const showResultEditor = resultEditorCardId === card.id;
                  const canRecordResult = dispatch.status === "launched" || dispatch.status === "done";
                  const actionsDisabled = dispatchingCardId !== null
                    || deletingCardId !== null
                    || updatingDispatchCardId !== null
                    || capturingDispatchResultCardId !== null;

                  return (
                    <div
                      className={`history-card-dispatch-note history-card-dispatch-note-${dispatchView.tone}`}
                      role="status"
                    >
                      <span>{dispatchView.label}</span>
                      {dispatchView.detail !== null ? <small>{dispatchView.detail}</small> : null}
                      {dispatch.resultSummary !== undefined ? (
                        <p className="history-card-dispatch-result">{dispatch.resultSummary}</p>
                      ) : null}
                      {showActions || canRecordResult ? (
                        <div className="history-card-dispatch-actions">
                          {showActions ? (
                            <>
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
                            </>
                          ) : null}
                          {canRecordResult ? (
                            <button
                              className="ghost-button history-card-dispatch-action"
                              disabled={actionsDisabled}
                              onClick={() => setResultEditorCardId((current) => current === card.id ? null : card.id)}
                              type="button"
                            >
                              记录结果
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {showResultEditor ? (
                        <div className="history-card-dispatch-result-editor">
                          <textarea
                            className="history-card-dispatch-result-input"
                            defaultValue={dispatch.resultSummary ?? ""}
                            disabled={capturingDispatchResultCardId !== null}
                            placeholder="粘贴 Claude Code 做了什么、验证了什么。"
                          />
                          <div className="history-card-dispatch-actions">
                            <button
                              className="ghost-button history-card-dispatch-action"
                              disabled={actionsDisabled}
                              onClick={(event) => {
                                const editor = event.currentTarget.closest(".history-card-dispatch-result-editor");
                                const input = editor?.querySelector<HTMLTextAreaElement>(".history-card-dispatch-result-input");
                                onCaptureClaudeDispatchResult(card, input?.value ?? "");
                              }}
                              type="button"
                            >
                              {capturingDispatchResultCardId === card.id ? "保存中..." : "保存结果"}
                            </button>
                            <button
                              className="ghost-button history-card-dispatch-action"
                              disabled={capturingDispatchResultCardId !== null}
                              onClick={() => setResultEditorCardId(null)}
                              type="button"
                            >
                              取消
                            </button>
                          </div>
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
            );
          })}
        </ul>
      )}
    </aside>
  );
}
