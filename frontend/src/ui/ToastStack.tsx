import { useToastStore } from "../state/toastStore";

export function ToastStack() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 20,
        left: 16,
        display: "flex",
        flexDirection: "column-reverse",
        gap: 6,
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="panel-pixel text-parchment"
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 11,
            padding: "10px 14px",
            maxWidth: 320,
            lineHeight: 1.8,
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
