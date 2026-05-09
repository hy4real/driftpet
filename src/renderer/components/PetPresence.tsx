type PetPresenceProps = {
  title: string;
  label: string;
  memoryActive: boolean;
  actionLabel?: string;
  onMemoryClick?: () => void;
};

export function PetPresence({ title, label, memoryActive, actionLabel, onMemoryClick }: PetPresenceProps) {
  return (
    <button
      className={`pet-presence-card ${memoryActive && onMemoryClick !== undefined ? "pet-presence-card-action" : ""}`}
      disabled={!memoryActive || onMemoryClick === undefined}
      onClick={onMemoryClick}
      type="button"
    >
      <strong className={memoryActive ? "pet-presence-memory-title" : undefined}>
        {title}
      </strong>
      <span>{memoryActive && actionLabel !== undefined ? actionLabel : label}</span>
    </button>
  );
}
