import { CSSProperties, useEffect, useRef, useState } from "react";
import { GameEngine } from "./GameEngine";
import { useGameStore } from "../state/gameStore";
import { useConnectionStore } from "../state/connectionStore";
import { useTargetingStore } from "../state/targetingStore";
import { AccusationModal } from "../ui/AccusationModal";
import { MerchantShopModal } from "../ui/MerchantShopModal";

export type AccusationTarget =
  | { type: "thief"; disguise: "none" | "partial" | "full" }
  | { type: "villager"; villagerId: number };

const targetingHintStyle: CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  color: "#ff8800",
  fontFamily: "monospace",
  fontSize: 12,
  fontWeight: "bold",
  letterSpacing: 1,
  pointerEvents: "none",
  userSelect: "none",
  background: "rgba(0,0,0,0.55)",
  borderRadius: 6,
  padding: "4px 10px",
  border: "1px solid #ff6600",
};

export function FarmCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const game = useGameStore((s) => s.game);
  const { playerId } = useConnectionStore();
  const { active: targeting, chosen, fieldCount, ownFarm } = useTargetingStore();

  const [accusationTarget, setAccusationTarget] =
    useState<AccusationTarget | null>(null);
  const [accusationAnchorY, setAccusationAnchorY] = useState<number | null>(
    null,
  );
  const [merchantOpen, setMerchantOpen] = useState(false);

  // Anger bubble: shown above the house when sow/harvest is blocked
  const [angerBubble, setAngerBubble] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const angerBubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const myPlayerState = game && playerId ? game.players[playerId] : undefined;
  const annoyanceLevel = myPlayerState?.wrongAccusationCount ?? 0;

  // ESC — cancel targeting OR dismiss accusation/merchant modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        useTargetingStore.getState().cancel();
        setAccusationTarget(null);
        setMerchantOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-close merchant modal when merchant leaves
  useEffect(() => {
    if (!myPlayerState?.merchant) setMerchantOpen(false);
  }, [myPlayerState?.merchant]);

  // Freeze only the accused entity while the modal is open
  useEffect(() => {
    engineRef.current?.setModalTarget(accusationTarget ?? null);
  }, [accusationTarget]);

  useEffect(() => {
    let mounted = true;
    const engine = new GameEngine();
    engineRef.current = engine;

    const isFieldBlocked = (fieldIndex: number): boolean => {
      const { game: g } = useGameStore.getState();
      const { playerId: pid } = useConnectionStore.getState();
      const field = pid ? g?.players[pid]?.fields[fieldIndex] : null;
      return !!(
        field?.fieldBlockedUntil && field.fieldBlockedUntil > Date.now()
      );
    };

    const showAngerBubble = (fieldIndex: number) => {
      const pos = engineRef.current?.getPlayerHouseScreenPos(fieldIndex);
      if (!pos) return;
      setAngerBubble(pos);
      if (angerBubbleTimerRef.current)
        clearTimeout(angerBubbleTimerRef.current);
      angerBubbleTimerRef.current = setTimeout(
        () => setAngerBubble(null),
        2500,
      );
    };

    const onSow = (fieldIndex: number) => {
      if (isFieldBlocked(fieldIndex)) {
        showAngerBubble(fieldIndex);
        return;
      }
      useConnectionStore.getState().send?.({
        type: "player_action",
        action: { kind: "SowField", fieldIndex, cropType: "wheat" },
      });
    };

    const onHarvest = (fieldIndex: number) => {
      if (isFieldBlocked(fieldIndex)) {
        showAngerBubble(fieldIndex);
        return;
      }
      useConnectionStore.getState().send?.({
        type: "player_action",
        action: { kind: "HarvestField", fieldIndex },
      });
    };

    const onScareCrow = (fieldIndex: number) => {
      useConnectionStore.getState().send?.({
        type: "player_action",
        action: { kind: "ScareCrow", fieldIndex },
      });
    };

    const onThiefClicked = () => {
      const { game: g } = useGameStore.getState();
      const { playerId: pid } = useConnectionStore.getState();
      const disguise = g?.players[pid ?? ""]?.thiefAttack?.disguise ?? "none";
      setAccusationAnchorY(window.innerHeight / 2);
      setAccusationTarget({ type: "thief", disguise });
    };

    const onVillagerClicked = (id: number) => {
      const pos = engineRef.current?.getPlayerHouseScreenPos(id);
      setAccusationAnchorY(pos?.y ?? null);
      setAccusationTarget({ type: "villager", villagerId: id });
    };

    const onVillagersChange = (count: number) => {
      useConnectionStore.getState().send?.({ type: "villagers", count });
    };

    const onMerchantClicked = () => {
      setMerchantOpen(true);
    };

    engine
      .init(
        containerRef.current!,
        onSow,
        onHarvest,
        onScareCrow,
        onThiefClicked,
        onVillagerClicked,
        onVillagersChange,
        onMerchantClicked,
      )
      .then(() => {
        if (!mounted) {
          engine.destroy();
          return;
        }
        const { game } = useGameStore.getState();
        const { playerId } = useConnectionStore.getState();
        if (game && playerId) engine.updateGameState(game, playerId);
      })
      .catch((err) => console.error("[GameEngine] init failed", err));

    return () => {
      mounted = false;
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (game && playerId && engineRef.current) {
      engineRef.current.updateGameState(game, playerId);
    }
  }, [game, playerId]);

  const remaining = fieldCount - chosen.length;

  const handleAction = () => {
    if (!accusationTarget) return;
    // Unfreeze the entity immediately so they resume walking during the response
    engineRef.current?.setModalTarget(null);
    if (accusationTarget.type === "thief") {
      useConnectionStore.getState().send?.({
        type: "player_action",
        action: { kind: "CatchThief" },
      });
    } else {
      useConnectionStore.getState().send?.({
        type: "player_action",
        action: {
          kind: "AccuseVillager",
          villagerId: accusationTarget.villagerId,
        },
      });
    }
  };

  const handleDismiss = () => {
    setAccusationTarget(null);
    setAccusationAnchorY(null);
  };

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        ref={containerRef}
        style={{ imageRendering: "pixelated", position: "absolute", inset: 0 }}
      />
      <span
        className="panel-pixel text-parchment"
        style={{
          position: "absolute",
          top: 12,
          left: 16,
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 11,
          padding: "5px 10px",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        Dein Hof
      </span>
      <span
        className="panel-pixel text-parchment"
        style={{
          position: "absolute",
          top: 12,
          right: 16,
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 11,
          padding: "5px 10px",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        Gegner
      </span>
      {targeting && (
        <span style={targetingHintStyle}>
          {ownFarm
            ? "Eigenes Feld wählen · Esc zum Abbrechen"
            : `Gegnerfeld wählen (${remaining} übrig) · Esc zum Abbrechen`}
        </span>
      )}

      {/* Anger speech bubble above the villager's house */}
      {angerBubble && (
        <div
          style={{
            position: "absolute",
            left: angerBubble.x,
            top: angerBubble.y - 36,
            transform: "translateX(-50%)",
            background: "#fff",
            boxShadow: "0 0 0 2px #000",
            padding: "5px 8px",
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 7,
            color: "#111",
            lineHeight: 1.5,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 30,
          }}
        >
          Ich helfe dir nicht!
        </div>
      )}

      {accusationTarget && (
        <AccusationModal
          key={
            accusationTarget.type === "villager"
              ? `v${accusationTarget.villagerId}`
              : "thief"
          }
          target={accusationTarget}
          annoyanceLevel={annoyanceLevel}
          anchorY={accusationAnchorY ?? undefined}
          onAction={handleAction}
          onDismiss={handleDismiss}
        />
      )}

      {merchantOpen && myPlayerState?.merchant && (
        <MerchantShopModal
          visit={myPlayerState.merchant}
          gold={myPlayerState.gold}
          onBuy={(itemId) => {
            useConnectionStore.getState().send?.({
              type: "player_action",
              action: {
                kind: "BuyItem",
                itemId: itemId as import("@gamedesign/shared").ItemId,
              },
            });
          }}
          onDismiss={() => setMerchantOpen(false)}
        />
      )}
    </div>
  );
}
