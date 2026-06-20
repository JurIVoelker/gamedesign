import { useCenterToastStore } from "../state/centerToastStore";

export function CenterToastStack() {
  const toasts = useCenterToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 72,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        pointerEvents: "none",
        zIndex: 60,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="panel-pixel text-parchment"
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 11,
            padding: "10px 16px",
            maxWidth: 380,
            lineHeight: 1.8,
            textAlign: "center",
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
