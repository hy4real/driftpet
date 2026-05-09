type PetControlsProps = {
  historyOpen: boolean;
  isExpanded: false;
  onOpenBench: () => void;
  onPoke: () => void;
  onToggleHistory: () => void;
  onMinimize: () => void;
};

export function PetControls({
  historyOpen,
  onOpenBench,
  onPoke,
  onToggleHistory,
  onMinimize
}: PetControlsProps) {
  return (
    <>
      <div className="pet-chip-row">
        <button
          className="pet-chip pet-chip-strong"
          onClick={onOpenBench}
          type="button"
        >
          打开小窝
        </button>
      </div>

      <div className="pet-chip-row">
        <button className="pet-pill" onClick={onPoke} type="button">
          戳我
        </button>
        <button
          className={`pet-pill ${historyOpen ? "pet-pill-active" : ""}`}
          onClick={onToggleHistory}
          type="button"
        >
          记忆
        </button>
        <button className="pet-pill" onClick={onMinimize} type="button">
          收起
        </button>
      </div>
    </>
  );
}
