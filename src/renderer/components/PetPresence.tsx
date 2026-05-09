type PetPresenceProps = {
  title: string;
  label: string;
  memoryActive: boolean;
};

export function PetPresence({ title, label, memoryActive }: PetPresenceProps) {
  return (
    <div className="pet-presence-card">
      <strong className={memoryActive ? "pet-presence-memory-title" : undefined}>
        {title}
      </strong>
      <span>{label}</span>
    </div>
  );
}
