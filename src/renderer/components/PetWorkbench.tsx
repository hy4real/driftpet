import { useState } from "react";
import type { CardRecord } from "../../main/types/card";
import type { ClaudeDispatchUserStatus } from "../../main/types/claude";
import type { RememberedThread } from "../../main/types/status";
import type { ThreadBundle } from "../../main/types/thread";
import type { ClipboardOffer } from "../../main/clipboard/watcher";
import type { WorklineLifecycleAction } from "../../main/workline/lifecycle";
import { getClaudeDispatchStatusView } from "../claude-dispatch-view";
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
import { PetSkinPanel } from "./PetSkinPanel";

type PetWorkbenchProps = {
  chaosText: string;
  companionNote: string | null;
  clipboardOffer: ClipboardOffer | null;
  isSubmitting: boolean;
  historyOpen: boolean;
  recentlyReleasedCardId: number | null;
  freshResolveCardId: number | null;
  rememberedThread: RememberedThread | null;
  rememberedThreadCard: CardRecord | null;
  dailyCloseLineCards: CardRecord[];
  hotCapChoice: {
    card: CardRecord;
    hotCards: CardRecord[];
  } | null;
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
  onUpdateWorklineLifecycle: (card: CardRecord, action: WorklineLifecycleAction) => void;
  onSkipDailyCloseLine: () => void;
  onHotCapLater: () => void;
  onHotCapDrop: () => void;
  onHotCapReplace: (card: CardRecord) => void;
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

const summarizeWorkbenchHistoryCard = (card: CardRecord): string =>
  card.threadCache?.nextMove
  ?? card.threadCache?.chasing
  ?? card.petRemark
  ?? card.knowledgeTag;

const summarizeThreadEntryCard = (card: CardRecord): string =>
  card.threadCache?.nextMove
  ?? card.threadCache?.chasing
  ?? card.petRemark
  ?? card.useFor;

const worklineActions: Array<{
  action: WorklineLifecycleAction;
  label: string;
  primary?: boolean;
}> = [
  { action: "continue_guarding", label: "继续守着", primary: true },
  { action: "tomorrow", label: "明天接" },
  { action: "archive", label: "沉淀" },
  { action: "drop", label: "放下" },
];

export function PetWorkbench({
  chaosText,
  companionNote,
  clipboardOffer,
  isSubmitting,
  historyOpen,
  recentlyReleasedCardId,
  freshResolveCardId,
  rememberedThread,
  rememberedThreadCard,
  dailyCloseLineCards,
  hotCapChoice,
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
  onUpdateWorklineLifecycle,
  onSkipDailyCloseLine,
  onHotCapLater,
  onHotCapDrop,
  onHotCapReplace,
  onSelectRecentCard,
  onDispatchClaudeThread,
  onUpdateClaudeDispatchStatus,
  onCaptureClaudeDispatchResult
}: PetWorkbenchProps) {
  const [showSkinPanel, setShowSkinPanel] = useState(false);
  const [historyFoldOpen, setHistoryFoldOpen] = useState(false);
  const [threadResultEditorOpen, setThreadResultEditorOpen] = useState(false);
  const now = Date.now();
  const threadAnchorCard = activeThreadBundle?.cards[0]?.card ?? null;
  const threadDispatchView = getClaudeDispatchStatusView(threadAnchorCard?.latestClaudeDispatch);
  const threadDispatch = threadAnchorCard?.latestClaudeDispatch ?? null;
  const threadStatusActionsDisabled = dispatchingCardId !== null
    || updatingDispatchCardId !== null
    || capturingDispatchResultCardId !== null;
  const rememberedAgeState = getGuardedThreadAgeState(rememberedThread?.createdAt ?? null, now);
  const rememberedVerb = guardedThreadVerbByAge[rememberedAgeState];
  const rememberedAction = formatGuardedThreadActionLabel(
    rememberedAgeState,
    getGuardedThreadNextMove(rememberedThreadCard),
    getGuardedThreadExpiresWhen(rememberedThreadCard),
    30
  );
  const rememberedProgress = getGuardedThreadProgress(rememberedThread?.createdAt ?? null, now);
  const rememberedTitle = getGuardedThreadTitle(rememberedThreadCard, rememberedThread) ?? rememberedThreadCard?.title ?? "";
  const rememberedWaitingReminder = getThreadWaitingReminder(rememberedThreadCard);
  const rememberedWaitingLabel = rememberedWaitingReminder.age === "cold"
    ? "可放下"
    : "正在等";
  const rememberedWaitingActionLabel = rememberedWaitingReminder.age === "cold"
    ? "先做别的"
    : "先推进";
  const threadAgeState = getGuardedThreadAgeState(threadAnchorCard?.createdAt ?? null, now);
  const threadVerb = guardedThreadVerbByAge[threadAgeState];
  const threadAction = formatGuardedThreadActionLabel(
    threadAgeState,
    threadAnchorCard?.threadCache?.nextMove ?? null,
    threadAnchorCard?.threadCache?.expiresWhen ?? null,
    44
  );
  const threadProgress = getGuardedThreadProgress(threadAnchorCard?.createdAt ?? null, now);
  const threadWaitingReminder = getThreadWaitingReminder(threadAnchorCard);
  const threadWaitingOn = threadWaitingReminder.waitingOn;
  const threadMeanwhile = threadWaitingReminder.meanwhile;
  const threadWaitingLabel = threadWaitingReminder.age === "cooling"
    ? "这条线已经等了一阵："
    : threadWaitingReminder.age === "cold"
      ? "这条线别再干等了："
      : "这条线现在在等：";

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

        {dailyCloseLineCards.length > 0 ? (
          <section className="pet-workbench-close-line" aria-label="每日收线">
            <div className="pet-workbench-close-line-header">
              <div>
                <p className="bubble-eyebrow">收线</p>
                <h3>这些我今天还要继续替你守吗？</h3>
              </div>
              <button
                type="button"
                className="pet-workbench-resume-strip-secondary"
                onClick={onSkipDailyCloseLine}
              >
                今天先不问
              </button>
            </div>
            <ul className="pet-workbench-close-line-list">
              {dailyCloseLineCards.map((card) => (
                <li key={card.id} className="pet-workbench-close-line-item">
                  <div className="pet-workbench-close-line-copy">
                    <strong>{card.title}</strong>
                    <span>{summarizeWorkbenchHistoryCard(card)}</span>
                  </div>
                  <div className="pet-workbench-close-line-actions">
                    {worklineActions.map(({ action, label, primary }) => (
                      <button
                        key={action}
                        type="button"
                        className={primary ? "pet-workbench-resume-strip-button" : "pet-workbench-resume-strip-secondary"}
                        onClick={() => onUpdateWorklineLifecycle(card, action)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {hotCapChoice !== null ? (
          <section className="pet-workbench-hot-cap" aria-label="守线选择">
            <div className="pet-workbench-close-line-header">
              <div>
                <p className="bubble-eyebrow">守线</p>
                <h3>我已经在帮你守 3 条线了。</h3>
                <p className="pet-workbench-thread-meta">
                  这张要替换哪一条，还是先放到今天稍后再看？
                </p>
              </div>
            </div>
            {hotCapChoice.hotCards.length > 0 ? (
              <div className="pet-workbench-hot-cap-replacements">
                {hotCapChoice.hotCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className="pet-workbench-hot-cap-replace"
                    onClick={() => onHotCapReplace(card)}
                  >
                    替换：{card.title}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="pet-workbench-close-line-actions">
              <button
                type="button"
                className="pet-workbench-resume-strip-secondary"
                onClick={onHotCapLater}
              >
                今天稍后再看
              </button>
              <button
                type="button"
                className="pet-workbench-resume-strip-secondary"
                onClick={onHotCapDrop}
              >
                直接放下
              </button>
            </div>
          </section>
        ) : null}

        {rememberedThreadCard !== null && freshResolveCardId === rememberedThreadCard.id ? (
          <div className="pet-workbench-fresh-resolve-strip" aria-label="刚等回来，值得优先接回">
            <div className="pet-workbench-fresh-resolve-copy">
              <span className="pet-workbench-fresh-resolve-eyebrow">优先接回</span>
              <strong>{rememberedTitle}</strong>
              <span className="pet-workbench-fresh-resolve-meta">
                {rememberedThreadCard.latestClaudeDispatch?.resultSummary?.trim().length
                  ? "Claude 结果刚记回这条线。"
                  : "这条线刚等回来，可以直接往下接。"}
              </span>
            </div>
            <button
              type="button"
              className="pet-workbench-fresh-resolve-button"
              onClick={onResurfaceRememberedThread}
            >
              现在接回
            </button>
          </div>
        ) : null}

        {rememberedThreadCard !== null ? (
          <div className="pet-workbench-resume-strip" aria-label="正在守着的工作记忆可接回">
            <div className="pet-workbench-resume-strip-copy">
              <span className="pet-workbench-resume-strip-eyebrow">正在守着的线</span>
              <span className="pet-workbench-resume-strip-title">{rememberedTitle}</span>
              <span className="pet-workbench-resume-strip-meta">
                {rememberedVerb} · {rememberedAction}
              </span>
              {rememberedWaitingReminder.state === "active" ? (
                <div className="pet-workbench-resume-strip-waiting">
                  <span className="pet-workbench-resume-strip-waiting-line">
                    {rememberedWaitingLabel}：{rememberedWaitingReminder.waitingOn}
                  </span>
                  {rememberedWaitingReminder.meanwhile !== null ? (
                    <span className="pet-workbench-resume-strip-waiting-line">
                      {rememberedWaitingActionLabel}：{rememberedWaitingReminder.meanwhile}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {rememberedWaitingReminder.state === "resolved" && rememberedWaitingReminder.age === "resolved_fresh" ? (
                <span className="pet-workbench-resume-strip-meta">
                  等回来了 · 可以直接顺着这条线继续做
                </span>
              ) : null}
              <div
                className={`pet-workbench-thread-progress pet-workbench-thread-progress-${rememberedAgeState}`}
                aria-hidden="true"
              >
                <span style={{ width: `${Math.round(rememberedProgress * 100)}%` }} />
              </div>
            </div>
            <div className="pet-workbench-resume-strip-actions">
              <button
                type="button"
                className="pet-workbench-resume-strip-button"
                onClick={onResurfaceRememberedThread}
              >
                接回
              </button>
              {worklineActions.map(({ action, label, primary }) => (
                <button
                  key={action}
                  type="button"
                  className={primary ? "pet-workbench-resume-strip-button" : "pet-workbench-resume-strip-secondary"}
                  onClick={() => {
                    if (rememberedThreadCard !== null) {
                      onUpdateWorklineLifecycle(rememberedThreadCard, action);
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {activeThreadBundle !== null ? (
          <section className="pet-workbench-thread-panel" aria-label="当前线头">
            <div className="pet-workbench-thread-header">
              <div className="pet-workbench-thread-heading">
                <p className="bubble-eyebrow">守线模式</p>
                <h3>这条工作记忆最近长了什么</h3>
                <p className="pet-workbench-thread-meta">
                  {threadVerb} · {threadAction}
                </p>
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
            <div
              className={`pet-workbench-thread-progress pet-workbench-thread-progress-${threadAgeState}`}
              aria-hidden="true"
            >
              <span style={{ width: `${Math.round(threadProgress * 100)}%` }} />
            </div>
            <p className="pet-workbench-thread-copy">
              先沿着这条被守住的工作记忆往下做，不用每次都从孤立卡片重新起步。
            </p>
            {threadWaitingOn !== null ? (
              <p className="pet-workbench-thread-wait-note">
                {threadWaitingLabel}{threadWaitingOn}
              </p>
            ) : null}
            {threadWaitingOn !== null && threadMeanwhile !== null ? (
              <p className="pet-workbench-thread-copy">
                {threadWaitingReminder.age === "cold" ? "先做别的，别围着它空转：" : "不用干等，先推进："}{threadMeanwhile}
              </p>
            ) : null}
            {threadWaitingReminder.state === "resolved" && threadWaitingReminder.age === "resolved_fresh" ? (
              <p className="pet-workbench-thread-copy">
                这条线等回来了，直接顺着当前下一步往下接。
              </p>
            ) : null}
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
                    <p>{summarizeThreadEntryCard(entry.card)}</p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <header className="pet-workbench-header">
          <div className="pet-workbench-header-copy">
            <p className="bubble-eyebrow">小窝</p>
            <h2>先交给我守着。</h2>
            {companionNote !== null ? (
              <p className="pet-workbench-inline-note" role="status">
                {companionNote}
              </p>
            ) : null}
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
              回到桌边
            </button>
          </div>
        </header>

        <label className="manual-input-shell">
          <span className="manual-input-label">粘贴问题、临时判断、已排除路径，乱一点也没关系</span>
          <textarea
            className="manual-input"
            disabled={isSubmitting}
            onChange={(event) => onChaosTextChange(event.target.value)}
            onInput={(event) => onChaosTextChange(event.currentTarget.value)}
            placeholder="例如：A 在等别人回复，这会儿先把 B 的验收补完；我怀疑不是 URL 抽取失败，而是 recall 去噪没压住；别再改 prompt。"
            value={chaosText}
          />
          <span className="manual-input-hint">
            不用挑模板。直接把主线、在等什么、这会儿先做什么、先别碰什么都塞进来。
          </span>
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
                      {recentlyReleasedCardId === card.id ? (
                        <span className="pet-workbench-history-badge">刚放下</span>
                      ) : null}
                      <strong>{card.title}</strong>
                      <span>{summarizeWorkbenchHistoryCard(card)}</span>
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
