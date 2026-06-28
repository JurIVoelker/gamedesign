import { CSSProperties, useEffect, useRef, useState } from "react";
import { GameEngine } from "./GameEngine";
import { useGameStore } from "../state/gameStore";
import { useConnectionStore } from "../state/connectionStore";
import { useTargetingStore } from "../state/targetingStore";
import { useCenterToastStore } from "../state/centerToastStore";
import { AccusationModal } from "../ui/AccusationModal";
import { MerchantShopModal } from "../ui/MerchantShopModal";
import {
  useTutorialStore,
  useRevealedSurfaces,
  getRevealedSurfaces,
  isInteractionAllowed,
} from "../state/tutorialStore";
const MERCHANT_BUBBLE_SHOW_MS = 8000;

export type AccusationTarget =
  | { type: "thief"; disguise: "none" | "partial" | "full" }
  | { type: "villager"; villagerId: number };

// Whether the player may open an accusation right now: outside the tutorial
// always; inside, only once villager accusation is revealed AND the current
// step allows it.
function canAccuse(
  tutState: ReturnType<typeof useTutorialStore.getState>,
): boolean {
  if (!tutState.active) return true;
  return (
    getRevealedSurfaces(tutState).has("villagerAccuse") &&
    isInteractionAllowed(tutState, "accuse")
  );
}

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
  const {
    active: targeting,
    chosen,
    fieldCount,
    ownFarm,
  } = useTargetingStore();

  const [accusationTarget, setAccusationTarget] =
    useState<AccusationTarget | null>(null);
  const [accusationAnchorY, setAccusationAnchorY] = useState<number | null>(
    null,
  );
  const [merchantOpen, setMerchantOpen] = useState(false);
  const revealed = useRevealedSurfaces();
  const tutActive = useTutorialStore((s) => s.active);
  const tutStage = useTutorialStore((s) => s.stage);
  const tutStepIndex = useTutorialStore((s) => s.stepIndex);
  const thiefHintActive = useTutorialStore((s) => s.thiefHintActive);

  // Anger bubble: shown above the house when sow/harvest is blocked
  const [angerBubble, setAngerBubble] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const angerBubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Merchant speech bubble: shown as HTML overlay when merchant arrives
  const [merchantBubble, setMerchantBubble] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const merchantBubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const merchantArrivalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const prevMerchantArrivesAtRef = useRef<number | null>(null);

  const myPlayerState = game && playerId ? game.players[playerId] : undefined;
  const annoyanceLevel = myPlayerState?.wrongAccusationCount ?? 0;

  // Merchant speech bubble: appear when merchant arrives, auto-dismiss after 8 s
  const merchant = myPlayerState?.merchant ?? null;
  useEffect(() => {
    if (!merchant) {
      clearTimeout(merchantArrivalTimerRef.current ?? undefined);
      clearTimeout(merchantBubbleTimerRef.current ?? undefined);
      setMerchantBubble(null);
      prevMerchantArrivesAtRef.current = null;
      return;
    }
    if (merchant.arrivesAt === prevMerchantArrivesAtRef.current) return;
    prevMerchantArrivesAtRef.current = merchant.arrivesAt;
    clearTimeout(merchantArrivalTimerRef.current ?? undefined);
    clearTimeout(merchantBubbleTimerRef.current ?? undefined);
    const delayMs = Math.max(0, merchant.arrivesAt - Date.now());
    merchantArrivalTimerRef.current = setTimeout(() => {
      const pos = engineRef.current?.getMerchantScreenPos();
      if (!pos) return;
      setMerchantBubble(pos);
      merchantBubbleTimerRef.current = setTimeout(
        () => setMerchantBubble(null),
        MERCHANT_BUBBLE_SHOW_MS,
      );
    }, delayMs);
  }, [merchant]);

  // Reposition bubble whenever the window is resized while it is visible
  const merchantBubbleActive = merchantBubble !== null;
  useEffect(() => {
    if (!merchantBubbleActive) return;
    const onResize = () => {
      const pos = engineRef.current?.getMerchantScreenPos();
      if (pos) setMerchantBubble(pos);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [merchantBubbleActive]);

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

    const isWelcomeStep = () => {
      const s = useTutorialStore.getState();
      return s.active && s.stepIndex === 0;
    };

    const onSow = (fieldIndex: number) => {
      if (isWelcomeStep()) return;
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
      if (isWelcomeStep()) return;
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
      const tutState = useTutorialStore.getState();
      if (tutState.active && !isInteractionAllowed(tutState, "scareCrow"))
        return;
      useConnectionStore.getState().send?.({
        type: "player_action",
        action: { kind: "ScareCrow", fieldIndex },
      });
    };

    const onThiefClicked = () => {
      if (!canAccuse(useTutorialStore.getState())) return;
      const { game: g } = useGameStore.getState();
      const { playerId: pid } = useConnectionStore.getState();
      const disguise = g?.players[pid ?? ""]?.thiefAttack?.disguise ?? "none";
      setAccusationAnchorY(window.innerHeight / 2);
      setAccusationTarget({ type: "thief", disguise });
    };

    const onVillagerClicked = (id: number) => {
      if (!canAccuse(useTutorialStore.getState())) return;
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

    const onBlindnessStart = () => {
      useCenterToastStore.getState().push("Du wirst geblendet!", 3_500);
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
        onBlindnessStart,
      )
      .then(() => {
        if (!mounted) {
          engine.destroy();
          return;
        }
        // Re-apply tutorial reveal state that may have changed during async init
        const tutState = useTutorialStore.getState();
        if (tutState.active) {
          engine.setTutorialReveal({
            opponentFarm: getRevealedSurfaces(tutState).has("opponentFarm"),
          });
          engine.setInteractionAllowed({
            accuse: isInteractionAllowed(tutState, "accuse"),
          });
          engine.setThiefHint(tutState.thiefHintActive);
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

  // Tutorial disclosure bridge: propagate surface visibility to PixiJS engine
  useEffect(() => {
    engineRef.current?.setTutorialReveal({
      opponentFarm: revealed.has("opponentFarm"),
    });
  }, [revealed]);

  // Tutorial assist bridge: reveal the incoming thief once the defend gate has
  // turned the hint on (after repeated failed catches).
  useEffect(() => {
    engineRef.current?.setThiefHint(thiefHintActive);
  }, [thiefHintActive]);

  // Tutorial interaction bridge: propagate per-step accusation permission so
  // villagers only show a clickable affordance when the current step allows it.
  useEffect(() => {
    engineRef.current?.setInteractionAllowed({
      accuse: isInteractionAllowed(
        { active: tutActive, stage: tutStage, stepIndex: tutStepIndex },
        "accuse",
      ),
    });
  }, [tutActive, tutStage, tutStepIndex]);

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
      {revealed.has("opponentFarm") && (
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
      )}
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

      {merchantBubble && !merchantOpen && (
        <div
          style={{
            position: "absolute",
            left: merchantBubble.x - 70,
            top: merchantBubble.y - 145,
            transform: "translateX(-50%)",
            pointerEvents: "none",
            zIndex: 30,
          }}
        >
          <div
            style={{
              background: "#f5e4c0",
              boxShadow: "0 0 0 2px #221100",
              padding: "8px 12px",
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 7,
              color: "#111",
              lineHeight: 1.8,
              textAlign: "center",
              whiteSpace: "nowrap",
              userSelect: "none",
            }}
          >
            Hallo, was kann ich
            <br />
            dir verkaufen?
          </div>
          {/* tail border */}
          <div
            style={{
              position: "absolute",
              bottom: -10,
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderTop: "10px solid #221100",
            }}
          />
          {/* tail fill */}
          <div
            style={{
              position: "absolute",
              bottom: -7,
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "8px solid #f5e4c0",
            }}
          />
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
