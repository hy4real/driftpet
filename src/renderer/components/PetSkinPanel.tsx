import { useEffect, useState } from "react";

type PetSkinPanelProps = {
  onClose: () => void;
};

type InstalledPet = {
  slug: string;
  displayName: string;
  isBuiltin: boolean;
  source: "builtin" | "driftpet" | "codex" | "petdex";
};

type ClaudeDispatchSettings = {
  terminalApp: string;
  workingDirectory: string;
  continuityMode: "continuous" | "isolated";
};

const TERMINAL_OPTIONS = ["Ghostty", "Terminal", "iTerm"] as const;
const CONTINUITY_OPTIONS = [
  { value: "continuous", label: "连续模式" },
  { value: "isolated", label: "独立卡片" },
] as const;

export function PetSkinPanel({ onClose }: PetSkinPanelProps) {
  const [pets, setPets] = useState<InstalledPet[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>("boba");
  const [installInput, setInstallInput] = useState("");
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispatchSettings, setDispatchSettings] = useState<ClaudeDispatchSettings>({
    terminalApp: "Ghostty",
    workingDirectory: "",
    continuityMode: "continuous",
  });
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    void window.driftpet.petList().then(setPets);
    void window.driftpet.petActive().then((active) => setActiveSlug(active.slug));
    void window.driftpet.getClaudeDispatchSettings().then(setDispatchSettings);
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

  const persistDispatchSettings = async (nextSettings: ClaudeDispatchSettings) => {
    setSavingSettings(true);
    setError(null);
    try {
      const saved = await window.driftpet.setClaudeDispatchSettings(nextSettings);
      setDispatchSettings(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claude Code 设置保存失败。");
    } finally {
      setSavingSettings(false);
    }
  };

  const renderPetSource = (pet: InstalledPet): string => {
    if (pet.isBuiltin) {
      return "内置";
    }
    if (pet.source === "codex") {
      return "Codex";
    }
    if (pet.source === "petdex") {
      return "Petdex";
    }
    return "本地";
  };

  return (
    <div className="pet-skin-panel">
      <div className="pet-skin-panel-header">
        <p className="bubble-eyebrow">设置</p>
        <button className="pet-pill" onClick={onClose} type="button">
          返回
        </button>
      </div>

      <section className="pet-settings-group">
        <div className="pet-settings-copy">
          <h3>Claude Code</h3>
          <p>切换弹起的终端，并指定 Claude 启动时所在的目录。</p>
        </div>

        <div className="pet-settings-copy">
          <h3>记忆模式</h3>
          <p>连续模式会维护 remembered thread；独立卡片模式会把卡片当作相对孤立的记录。</p>
        </div>

        <div className="pet-settings-terminals" role="group" aria-label="记忆模式">
          {CONTINUITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`pet-skin-card ${dispatchSettings.continuityMode === option.value ? "pet-skin-card-active" : ""}`}
              disabled={savingSettings}
              onClick={() => void persistDispatchSettings({ ...dispatchSettings, continuityMode: option.value })}
              type="button"
            >
              <span className="pet-skin-name">{option.label}</span>
            </button>
          ))}
        </div>

        <div className="pet-settings-terminals" role="group" aria-label="Claude Code 终端">
          {TERMINAL_OPTIONS.map((option) => (
            <button
              key={option}
              className={`pet-skin-card ${dispatchSettings.terminalApp === option ? "pet-skin-card-active" : ""}`}
              disabled={savingSettings}
              onClick={() => void persistDispatchSettings({ ...dispatchSettings, terminalApp: option })}
              type="button"
            >
              <span className="pet-skin-name">{option}</span>
            </button>
          ))}
        </div>

        <label className="pet-settings-field">
          <span className="pet-settings-label">Claude 启动目录</span>
          <input
            className="pet-skin-input"
            disabled={savingSettings}
            onChange={(e) => {
              setDispatchSettings((current) => ({
                ...current,
                workingDirectory: e.target.value,
              }));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void persistDispatchSettings(dispatchSettings);
              }
            }}
            placeholder="/absolute/path/to/project"
            value={dispatchSettings.workingDirectory}
          />
        </label>
        <div className="pet-settings-actions">
          <button
            className="pet-button pet-button-accent"
            disabled={savingSettings}
            onClick={() => void persistDispatchSettings(dispatchSettings)}
            type="button"
          >
            {savingSettings ? "保存中..." : "保存 Claude 设置"}
          </button>
        </div>
      </section>

      <section className="pet-settings-group">
        <div className="pet-settings-copy">
          <h3>桌宠</h3>
          <p>切换当前桌宠，或安装新的 petdex 角色。命令、链接和 slug 都可以直接贴进来，安装后也会同步到本机 `~/.codex/pets`。</p>
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
              <span className="pet-skin-badge">{renderPetSource(pet)}</span>
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
            placeholder="粘贴 npx petdex install ...、petdex 链接或 slug"
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
      </section>

      {error !== null ? <p className="pet-skin-error">{error}</p> : null}
    </div>
  );
}
