import type { MouseEventHandler, PointerEventHandler, RefObject } from "react";
import type { PetExpression } from "../pet-ui-state";
import bobaSpritesheet from "../assets/boba-spritesheet.webp";

type PetAvatarProps = {
  windowMode: "mini" | "compact" | "expanded";
  petExpression: PetExpression;
  reaction: "idle" | "peek" | "nudge";
  hovered: boolean;
  dragging: boolean;
  landing: boolean;
  runDirection: "center" | "left" | "right" | "up" | "down";
  runFast: boolean;
  spritesheetUrl: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onClick: MouseEventHandler<HTMLButtonElement>;
  onContextMenu: MouseEventHandler<HTMLButtonElement>;
  onDoubleClick?: MouseEventHandler<HTMLButtonElement>;
  onLostPointerCapture: PointerEventHandler<HTMLButtonElement>;
  onPointerCancel: PointerEventHandler<HTMLButtonElement>;
  onPointerDown: PointerEventHandler<HTMLButtonElement>;
  onPointerEnter: PointerEventHandler<HTMLButtonElement>;
  onPointerLeave: PointerEventHandler<HTMLButtonElement>;
  onPointerMove: PointerEventHandler<HTMLButtonElement>;
  onPointerUp: PointerEventHandler<HTMLButtonElement>;
};

export function PetAvatar({
  windowMode,
  petExpression,
  reaction,
  hovered,
  dragging,
  landing,
  runDirection,
  runFast,
  spritesheetUrl,
  buttonRef,
  onClick,
  onContextMenu,
  onDoubleClick,
  onLostPointerCapture,
  onPointerCancel,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  onPointerUp
}: PetAvatarProps) {
  const isMini = windowMode === "mini";
  const isExpanded = windowMode === "expanded";

  return (
    <button
      aria-label={isMini ? "Boba 桌宠，单击互动，右键打开小窝" : "Boba 桌宠"}
      className={`pet-avatar-button pet-avatar-button-${windowMode} pet-avatar-button-${petExpression} ${isExpanded ? "pet-avatar-button-expanded" : ""} ${reaction !== "idle" ? `pet-react-${reaction}` : ""} ${hovered && !dragging ? "pet-hovered" : ""} ${dragging ? "pet-dragging" : ""} ${landing ? "pet-wave" : ""} ${dragging ? `pet-run-${runDirection}` : ""} ${dragging && runFast ? "pet-run-fast" : ""}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      onLostPointerCapture={onLostPointerCapture}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      ref={buttonRef}
      type="button"
    >
      <div
        className={`pet-sprite pet-sprite-${windowMode} pet-sprite-${petExpression}`}
        style={{ backgroundImage: `url(${spritesheetUrl || bobaSpritesheet})` }}
      />
    </button>
  );
}
