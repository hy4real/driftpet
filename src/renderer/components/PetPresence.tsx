type PetPresenceProps = {
  title: string;
  label: string;
  memoryActive: boolean;
  onMemoryClick?: () => void;
};

export function PetPresence({ title, label, memoryActive, onMemoryClick }: PetPresenceProps) {
  return (
    <div className="pet-presence-card">
      {memoryActive && onMemoryClick !== undefined ? (
        <button
          type="button"
          className="pet-presence-memory-title pet-presence-memory-button"
          onClick={onMemoryClick}
        >
          {title}
        </button>
      ) : (
        <strong className={memoryActive ? "pet-presence-memory-title" : undefined}>
          {title}
        </strong>
      )}
      <span>{label}</span>
    </div>
  );
}
