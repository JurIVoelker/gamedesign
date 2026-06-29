import { useEffect, useRef, useState } from "react";
import type { AccusationTarget } from "../game/FarmCanvas";
import { SoundManager } from "../game/sound/SoundManager";

const TIMEOUT_S = 10;
const RESPONSE_MS = 2000;

// Character sprite at 3× scale
const FRAME_W = 14;
const FRAME_H = 23;
const SCALE = 3;
const SHEET_W = 62;

// Slightly lighter than the raw PixiJS canvas color (#a7af4f) to compensate
// for the perceived darkening caused by the surrounding dark border.
const SCENE_BG = "#b4bc54";

const DECO_SCALE = 3;

// Grass and flowers spread across the whole frame (top + left as %)
const DECORATIONS = [
  { src: "/assets/grass.png", top: "6%", left: "4%" },
  { src: "/assets/grass.png", top: "18%", left: "62%" },
  { src: "/assets/grass.png", top: "38%", left: "82%" },
  { src: "/assets/grass.png", top: "52%", left: "12%" },
  { src: "/assets/grass.png", top: "72%", left: "48%" },
  { src: "/assets/grass.png", top: "78%", left: "4%" },
  { src: "/assets/grass.png", top: "80%", left: "82%" },
  { src: "/assets/flower.png", top: "10%", left: "38%" },
  { src: "/assets/flower.png", top: "8%", left: "78%" },
  { src: "/assets/flower.png", top: "30%", left: "28%" },
  { src: "/assets/flower.png", top: "48%", left: "68%" },
  { src: "/assets/flower.png", top: "68%", left: "22%" },
  { src: "/assets/flower.png", top: "74%", left: "62%" },
] as const;

const GRASS_W = Math.round(8 * DECO_SCALE);
const GRASS_H = Math.round(6 * DECO_SCALE);
const FLOWER_W = Math.round(11 * DECO_SCALE);
const FLOWER_H = Math.round(8 * DECO_SCALE);

function decorSize(src: string) {
  return src.includes("flower")
    ? { width: FLOWER_W, height: FLOWER_H }
    : { width: GRASS_W, height: GRASS_H };
}

function portraitSrc(target: AccusationTarget): string {
  if (target.type === "villager") return "/assets/villager-front-right.png";
  if (target.disguise === "none") return "/assets/theif-1-front-right.png";
  if (target.disguise === "partial") return "/assets/theif-2-front-right.png";
  return "/assets/villager-front-right.png";
}

function villagerResponse(levelBeforeAccuse: number): string {
  if (levelBeforeAccuse >= 2) return "Jetzt reicht's! Ich geh nach Hause!";
  if (levelBeforeAccuse === 1) return "Nochmal?! Ich bin unschuldig!";
  return "Ich bin kein Dieb! Lass mich in Ruhe!";
}

interface Props {
  target: AccusationTarget;
  annoyanceLevel: number;
  anchorY?: number;
  onAction: () => void;
  onDismiss: () => void;
}

export function AccusationModal({
  target,
  annoyanceLevel,
  anchorY,
  onAction,
  onDismiss,
}: Props) {
  const [timeLeft, setTimeLeft] = useState(TIMEOUT_S);
  const [response, setResponse] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const responseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (response !== null) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          onDismiss();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [response, onDismiss]);

  const handleYes = () => {
    SoundManager.play("click");
    if (timerRef.current) clearInterval(timerRef.current);
    onAction();
    const text =
      target.type === "thief"
        ? "Da hast du mich erwischt!"
        : villagerResponse(annoyanceLevel);
    setResponse(text);
    responseTimerRef.current = setTimeout(onDismiss, RESPONSE_MS);
  };

  const handleNo = () => {
    SoundManager.play("click");
    if (timerRef.current) clearInterval(timerRef.current);
    onDismiss();
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleNo();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      if (responseTimerRef.current) clearTimeout(responseTimerRef.current);
    };
  }, []);

  const src = portraitSrc(target);
  const charW = FRAME_W * SCALE;
  const charH = FRAME_H * SCALE;

  const MODAL_H = 295;
  const vPos =
    anchorY !== undefined
      ? {
          top: Math.max(
            16,
            Math.min(anchorY - MODAL_H / 2, window.innerHeight - MODAL_H - 16),
          ),
        }
      : { bottom: 160 };

  return (
    <div
      style={{
        position: "absolute",
        ...vPos,
        left: "calc(50% - 180px)",
        zIndex: 40,
        width: 360,
      }}
    >
      <div
        className="panel-pixel text-parchment"
        style={{
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Title row: question + timer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            className="text-gold"
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 7,
              lineHeight: 1.6,
            }}
          >
            Ist das ein Dieb?
          </div>
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 8,
              color: timeLeft <= 3 ? "#d04040" : "#a89060",
              minWidth: 28,
              textAlign: "right",
            }}
          >
            {response === null ? `${timeLeft}s` : ""}
          </div>
        </div>

        {/* Mini scene frame */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 180,
            overflow: "hidden",
            background: SCENE_BG,
            boxShadow: "0 0 0 2px #c8a84b, 0 0 0 4px #000",
            imageRendering: "pixelated",
          }}
        >
          {/* Grass and flower decorations spread across the frame */}
          {DECORATIONS.map((d, i) => {
            const { width, height } = decorSize(d.src);
            return (
              <img
                key={i}
                src={d.src}
                style={{
                  position: "absolute",
                  top: d.top,
                  left: d.left,
                  width,
                  height,
                  imageRendering: "pixelated",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              />
            );
          })}

          {/* Character sprite — bottom-centered, idle frame, facing right */}
          <div
            style={{
              position: "absolute",
              bottom: 32,
              left: "50%",
              transform: "translateX(-50%)",
              width: charW,
              height: charH,
              backgroundImage: `url('${src}')`,
              backgroundSize: `${SHEET_W * SCALE}px ${FRAME_H * SCALE}px`,
              backgroundPosition: "0 0",
              backgroundRepeat: "no-repeat",
              imageRendering: "pixelated",
            }}
          />

          {/* Speech bubble inside frame — only visible after a decision */}
          {response !== null && (
            <div
              style={{
                position: "absolute",
                top: 6,
                left: 6,
                right: 6,
                background: "#fff",
                boxShadow: "0 0 0 2px #000",
                padding: "7px 9px",
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 8,
                lineHeight: 1.8,
                color: "#111",
              }}
            >
              {response}
            </div>
          )}
        </div>

        {/* Equal-width buttons — disabled after a decision is made */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn-pixel-secondary"
            onClick={handleNo}
            disabled={response !== null}
            style={{ flex: 1 }}
          >
            Nein
            <span style={{ fontSize: 5, opacity: 0.6, marginLeft: 4 }}>
              [ESC]
            </span>
          </button>
          <button
            className="btn-pixel"
            onClick={handleYes}
            disabled={response !== null}
            style={{ flex: 1 }}
          >
            Ja, Dieb!
          </button>
        </div>
      </div>
    </div>
  );
}
