import { useState } from "react";
import type { ClipboardOffer } from "../../main/clipboard/watcher";
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
  onChaosTextChange: (value: string) => void;
  onAcceptClipboardOffer: () => void;
  onDismissClipboardOffer: () => void;
  onSubmitChaosReset: () => void;
  onReturnToPet: () => void;
  onToggleHistory: () => void;
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
  onChaosTextChange,
  onAcceptClipboardOffer,
  onDismissClipboardOffer,
  onSubmitChaosReset,
  onReturnToPet,
  onToggleHistory
}: PetWorkbenchProps) {
  const [showSkinPanel, setShowSkinPanel] = useState(false);

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

        <header className="pet-workbench-header">
          <div>
            <p className="bubble-eyebrow">小窝</p>
            <h2>先放进来，我帮你收好。</h2>
          </div>
          <div className="pet-workbench-toolbar" aria-label="小窝操作">
            <button
              className={`pet-pill ${historyOpen ? "pet-pill-active" : ""}`}
              onClick={onToggleHistory}
              type="button"
            >
              记忆
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
          <span className="manual-input-label">粘贴链接、想法、上下文，乱一点也没关系</span>
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
            placeholder="例如：刚看的链接、突然冒出的任务、下一步想做但还没想清楚的事。"
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
            {isSubmitting ? "正在保存..." : "保存到小窝"}
          </button>
        </div>
      </section>
    </div>
  );
}
