import { useState } from "react";
import type { CardRecord } from "../../main/types/card";
import type { ClaudeDispatchUserStatus } from "../../main/types/claude";
import type { RememberedThread } from "../../main/types/status";
import type { ThreadBundle } from "../../main/types/thread";
import type { ClipboardOffer } from "../../main/clipboard/watcher";
import { getClaudeDispatchStatusView } from "../claude-dispatch-view";
import { PetSkinPanel } from "./PetSkinPanel";

type ResetTemplate = {
  label: string;
  value: string;
};

type PetWorkbenchProps = {
  chaosText: string;
  clipboardOffer: ClipboardOffer | null;
  isSubmitting: boolean;
  resetTemplates: readonly ResetTemplate[];
  historyOpen: boolean;
  rememberedThread: RememberedThread | null;
  rememberedThreadCard: CardRecord | null;
  activeThreadBundle: ThreadBundle | null;
  recentCards: CardRecord[];
  dispatchingCardId: number | null;
  updatingDispatchCardId: number | null;
  capturingDispatchResultCardId: number | null;
  onChaosTextChange: (value: string) => void;
  onAcceptClipboardOffer: () => void;
  onDismissClipboardOffer: () => void;
  onSubmitChaosReset: () => void;
  onReturnToPet: () => void;
  onToggleHistory: () => void;
  onResurfaceRememberedThread: () => void;
  onSelectRecentCard: (card: CardRecord) => void;
  onDispatchClaudeThread: (card: CardRecord) => void;
  onUpdateClaudeDispatchStatus: (card: CardRecord, status: ClaudeDispatchUserStatus) => void;
  onCaptureClaudeDispatchResult: (card: CardRecord, resultSummary: string) => void;
};

const previewClipboardText = (raw: string, maxLength = 72): string => {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength - 1)}…`;
};

export function PetWorkbench({
  chaosText,
  clipboardOffer,
  isSubmitting,
  resetTemplates,
  historyOpen,
  rememberedThread,
  rememberedThreadCard,
  activeThreadBundle,
  recentCards,
  dispatchingCardId,
  updatingDispatchCardId,
  capturingDispatchResultCardId,
  onChaosTextChange,
  onAcceptClipboardOffer,
  onDismissClipboardOffer,
  onSubmitChaosReset,
  onReturnToPet,
  onToggleHistory,
  onResurfaceRememberedThread,
  onSelectRecentCard,
  onDispatchClaudeThread,
  onUpdateClaudeDispatchStatus,
  onCaptureClaudeDispatchResult
}: PetWorkbenchProps) {
  const [showSkinPanel, setShowSkinPanel] = useState(false);
  const [historyFoldOpen, setHistoryFoldOpen] = useState(false);
  const [threadResultEditorOpen, setThreadResultEditorOpen] = useState(false);
  const threadAnchorCard = activeThreadBundle?.cards[0]?.card ?? null;
  const threadDispatchView = getClaudeDispatchStatusView(threadAnchorCard?.latestClaudeDispatch);
  const threadDispatch = threadAnchorCard?.latestClaudeDispatch ?? null;
  const threadStatusActionsDisabled = dispatchingCardId !== null
    || updatingDispatchCardId !== null
    || capturingDispatchResultCardId !== null;

  if (showSkinPanel) {
    return (
      <div className="pet-workbench-outer">
        <section className="pet-workbench">
          <PetSkinPanel onClose={() => setShowSkinPanel(false)} />
        </section>
      </div>
    );
  }

  return (
    <div className="pet-workbench-outer">
      <section className="pet-workbench">
        {clipboardOffer !== null ? (
          <section className="pet-workbench-clipboard" aria-label="剪贴板待收">
            <div className="pet-workbench-clipboard-copy">
              <p className="bubble-eyebrow">剪贴板</p>
              <h3>刚复制的内容先放这儿</h3>
              <p className="pet-workbench-clipboard-preview">{previewClipboardText(clipboardOffer.text)}</p>
            </div>
            <div className="pet-workbench-clipboard-actions">
              <button
                type="button"
                className="pet-button pet-button-strong pet-workbench-clipboard-accept"
                onClick={onAcceptClipboardOffer}
              >
                收进输入框
              </button>
              <button
                type="button"
                className="pet-button pet-workbench-clipboard-dismiss"
                onClick={onDismissClipboardOffer}
              >
                先放着
              </button>
            </div>
          </section>
        ) : null}

        {rememberedThreadCard !== null ? (
          <div className="pet-workbench-resume-strip" aria-label="正在守着的工作记忆可接回">
            <span className="pet-workbench-resume-strip-eyebrow">正在守着的线</span>
            <span className="pet-workbench-resume-strip-title">{rememberedThreadCard.title}</span>
            <button
              type="button"
              className="pet-workbench-resume-strip-button"
              onClick={onResurfaceRememberedThread}
            >
              接回
            </button>
          </div>
        ) : null}

        {activeThreadBundle !== null ? (
          <section className="pet-workbench-thread-panel" aria-label="当前线头">
            <div className="pet-workbench-thread-header">
              <div>
                <p className="bubble-eyebrow">守线模式</p>
                <h3>这条工作记忆最近长了什么</h3>
              </div>
              <button
                type="button"
                className="pet-button pet-button-strong"
                disabled={threadAnchorCard === null || dispatchingCardId !== null}
                onClick={() => {
                  if (threadAnchorCard !== null) {
                    onDispatchClaudeThread(threadAnchorCard);
                  }
                }}
              >
                {threadAnchorCard !== null && dispatchingCardId === threadAnchorCard.id
                  ? "正在派发..."
                  : "派给 Claude Code（整条线）"}
              </button>
            </div>
            <p className="pet-workbench-thread-copy">
              先沿着这条被守住的工作记忆往下做，不用每次都从孤立卡片重新起步。
            </p>
            {threadAnchorCard !== null && threadDispatch !== null && threadDispatchView !== null ? (
              <div className={`pet-workbench-thread-dispatch pet-workbench-thread-dispatch-${threadDispatchView.tone}`} role="status">
                <span>{threadDispatchView.label}</span>
                {threadDispatchView.detail !== null ? <small>{threadDispatchView.detail}</small> : null}
                {threadDispatch.resultSummary !== undefined ? (
                  <p className="pet-workbench-thread-dispatch-result">{threadDispatch.resultSummary}</p>
                ) : null}
                {threadDispatch.status === "launched" || threadDispatch.status === "done" ? (
                  <div className="pet-workbench-thread-dispatch-actions">
                    {threadDispatch.status === "launched" ? (
                      <>
                        <button
                          type="button"
                          className="ghost-button pet-workbench-thread-dispatch-action"
                          disabled={threadStatusActionsDisabled}
                          onClick={() => onUpdateClaudeDispatchStatus(threadAnchorCard, "done")}
                        >
                          {updatingDispatchCardId === threadAnchorCard.id ? "更新中..." : "标记完成"}
                        </button>
                        <button
                          type="button"
                          className="ghost-button pet-workbench-thread-dispatch-action"
                          disabled={threadStatusActionsDisabled}
                          onClick={() => onUpdateClaudeDispatchStatus(threadAnchorCard, "dismissed")}
                        >
                          收起记录
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="ghost-button pet-workbench-thread-dispatch-action"
                      disabled={threadStatusActionsDisabled}
                      onClick={() => setThreadResultEditorOpen((open) => !open)}
                    >
                      记录结果
                    </button>
                  </div>
                ) : null}
                {threadResultEditorOpen ? (
                  <div className="pet-workbench-thread-result-editor">
                    <textarea
                      className="pet-workbench-thread-result-input"
                      defaultValue={threadDispatch.resultSummary ?? ""}
                      disabled={capturingDispatchResultCardId !== null}
                      placeholder="粘贴 Claude Code 做了什么、验证了什么。"
                    />
                    <div className="pet-workbench-thread-dispatch-actions">
                      <button
                        type="button"
                        className="ghost-button pet-workbench-thread-dispatch-action"
                        disabled={threadStatusActionsDisabled}
                        onClick={(event) => {
                          const editor = event.currentTarget.closest(".pet-workbench-thread-result-editor");
                          const input = editor?.querySelector<HTMLTextAreaElement>(".pet-workbench-thread-result-input");
                          onCaptureClaudeDispatchResult(threadAnchorCard, input?.value ?? "");
                        }}
                      >
                        {capturingDispatchResultCardId === threadAnchorCard.id ? "保存中..." : "保存结果"}
                      </button>
                      <button
                        type="button"
                        className="ghost-button pet-workbench-thread-dispatch-action"
                        disabled={capturingDispatchResultCardId !== null}
                        onClick={() => setThreadResultEditorOpen(false)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <ul className="pet-workbench-thread-list">
              {activeThreadBundle.cards.map((entry) => (
                <li key={entry.card.id}>
                  <button
                    type="button"
                    className="pet-workbench-thread-item"
                    onClick={() => onSelectRecentCard(entry.card)}
                  >
                    <strong>{entry.card.title}</strong>
                    <span>{entry.card.knowledgeTag}</span>
                    <p>{entry.card.threadCache?.nextMove ?? entry.card.useFor}</p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <header className="pet-workbench-header">
          <div>
            <p className="bubble-eyebrow">小窝</p>
            <h2>先交给我守着。</h2>
          </div>
          <div className="pet-workbench-toolbar" aria-label="小窝操作">
            <button
              className={`pet-pill ${historyOpen ? "pet-pill-active" : ""}`}
              onClick={onToggleHistory}
              type="button"
            >
              放下的线
            </button>
            <button
              className="pet-pill"
              onClick={() => setShowSkinPanel(true)}
              type="button"
            >
              设置
            </button>
            <button
              className="pet-pill pet-pill-accent workbench-return"
              onClick={onReturnToPet}
              type="button"
            >
              收起
            </button>
          </div>
        </header>

        <label className="manual-input-shell">
          <span className="manual-input-label">粘贴问题、临时判断、已排除路径，乱一点也没关系</span>
          <div className="template-row">
            {resetTemplates.map((template) => (
              <button
                key={template.label}
                className="template-chip"
                onClick={() => onChaosTextChange(template.value)}
                type="button"
              >
                {template.label}
              </button>
            ))}
          </div>
          <textarea
            className="manual-input"
            disabled={isSubmitting}
            onChange={(event) => onChaosTextChange(event.target.value)}
            placeholder="例如：我怀疑不是 URL 抽取失败，而是 recall 去噪没压住；下一步先跑两条 MDN locale URL，别再改 prompt。"
            value={chaosText}
          />
        </label>

        <div className="workbench-actions">
          <button
            className="pet-button pet-button-strong"
            disabled={isSubmitting}
            onClick={onSubmitChaosReset}
            type="button"
          >
            {isSubmitting ? "正在守住..." : "交给它守"}
          </button>
        </div>

        {recentCards.length > 0 ? (
          <div className="pet-workbench-history-fold">
            <button
              type="button"
              className={`pet-workbench-history-toggle ${historyFoldOpen ? "pet-workbench-history-toggle-open" : ""}`}
              onClick={() => setHistoryFoldOpen((open) => !open)}
            >
              {historyFoldOpen ? "收起放下的线" : `放下的线 (${recentCards.length})`}
            </button>
            {historyFoldOpen ? (
              <ul className="pet-workbench-history-list">
                {recentCards.map((card) => (
                  <li key={card.id}>
                    <button
                      type="button"
                      className="pet-workbench-history-item"
                      onClick={() => onSelectRecentCard(card)}
                    >
                      <strong>{card.title}</strong>
                      <span>{card.threadCache?.chasing ?? card.knowledgeTag}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
