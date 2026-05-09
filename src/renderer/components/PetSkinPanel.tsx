import { useEffect, useState } from "react";

type PetSkinPanelProps = {
  onClose: () => void;
};

type InstalledPet = {
  slug: string;
  displayName: string;
  isBuiltin: boolean;
};

export function PetSkinPanel({ onClose }: PetSkinPanelProps) {
  const [pets, setPets] = useState<InstalledPet[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>("boba");
  const [installInput, setInstallInput] = useState("");
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.driftpet.petList().then(setPets);
    void window.driftpet.petActive().then((active) => setActiveSlug(active.slug));
  }, []);

  const handleInstall = async () => {
    const trimmed = installInput.trim();
    if (trimmed.length === 0 || installing) {
      return;
    }

    setInstalling(true);
    setError(null);
    try {
      const result = await window.driftpet.petInstall(trimmed);
      setActiveSlug(result.slug);
      setInstallInput("");
      const updated = await window.driftpet.petList();
      setPets(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "安装失败，请检查链接或 slug。");
    } finally {
      setInstalling(false);
    }
  };

  const handleSetActive = async (slug: string) => {
    if (slug === activeSlug) {
      return;
    }
    await window.driftpet.petSetActive(slug);
    setActiveSlug(slug);
  };

  return (
    <div className="pet-skin-panel">
      <div className="pet-skin-panel-header">
        <p className="bubble-eyebrow">桌宠</p>
        <button className="pet-pill" onClick={onClose} type="button">
          返回
        </button>
      </div>

      <div className="pet-skin-list">
        {pets.map((pet) => (
          <button
            key={pet.slug}
            className={`pet-skin-card ${pet.slug === activeSlug ? "pet-skin-card-active" : ""}`}
            onClick={() => void handleSetActive(pet.slug)}
            type="button"
          >
            <span className="pet-skin-name">{pet.displayName}</span>
            {pet.isBuiltin ? <span className="pet-skin-badge">内置</span> : null}
          </button>
        ))}
      </div>

      <div className="pet-skin-install">
        <input
          className="pet-skin-input"
          disabled={installing}
          onChange={(e) => setInstallInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void handleInstall();
            }
          }}
          placeholder="粘贴 petdex 链接或 slug"
          value={installInput}
        />
        <button
          className="pet-button pet-button-accent"
          disabled={installing || installInput.trim().length === 0}
          onClick={() => void handleInstall()}
          type="button"
        >
          {installing ? "安装中..." : "安装"}
        </button>
      </div>

      {error !== null ? <p className="pet-skin-error">{error}</p> : null}
    </div>
  );
}
