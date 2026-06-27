import { useEffect, useRef, useState } from "react";
import type { Item, ActiveEffect, ItemId } from "@gamedesign/shared";
import { ITEM_DEFS, pointlessPotionDesc } from "@gamedesign/shared";
import { useConnectionStore } from "../state/connectionStore";
import { useGameStore } from "../state/gameStore";
import { useTargetingStore } from "../state/targetingStore";
import { useNow } from "../hooks/useNow";
import { ItemIcon } from "./ItemIcons";
import { useRevealedSurfaces } from "../state/tutorialStore";

const SLOT_STYLE = {
  width: 88,
  minHeight: 72,
  padding: "6px 4px",
  minWidth: "unset",
  justifyContent: "center",
  alignItems: "center",
  gap: 4,
} as const;

const NAME_STYLE = {
  fontFamily: "'Press Start 2P', monospace",
  fontSize: 7,
  textAlign: "center" as const,
  lineHeight: 1.4,
  overflowWrap: "break-word" as const,
  hyphens: "auto" as const,
  maxWidth: 80,
};

const POINTLESS_PARTICLE_COUNT = 18;
const POINTLESS_PARTICLE_DURATION_MS = 1800;

function usePointlessParticles(item: Item) {
  const prevCountRef = useRef(item.count);
  const [burstKey, setBurstKey] = useState<number | null>(null);

  useEffect(() => {
    if (item.id === "pointless_potion" && item.count < prevCountRef.current) {
      setBurstKey(Date.now());
      const t = setTimeout(
        () => setBurstKey(null),
        POINTLESS_PARTICLE_DURATION_MS + 50,
      );
      prevCountRef.current = item.count;
      return () => clearTimeout(t);
    }
    prevCountRef.current = item.count;
  }, [item.id, item.count]);

  return burstKey;
}

function PointlessParticleBurst({ burstKey }: { burstKey: number }) {
  const particles = Array.from({ length: POINTLESS_PARTICLE_COUNT }, (_, i) => {
    const angle = (i / POINTLESS_PARTICLE_COUNT) * Math.PI * 2 + (i % 3) * 0.2;
    const dist = 28 + (i % 4) * 10;
    return {
      id: i,
      tx: Math.round(Math.cos(angle) * dist),
      ty: Math.round(Math.sin(angle) * dist),
      delay: (i % 4) * 40,
    };
  });

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      {particles.map((p) => (
        <div
          key={`${burstKey}-${p.id}`}
          style={{
            position: "absolute",
            width: 8,
            height: 8,
            backgroundImage: "url(/assets/particle.png)",
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            filter: "sepia(1) hue-rotate(-50deg) saturate(3) brightness(1.3)",
            transform: "translate(-50%, -50%)",
            animation: `pointless-particle ${POINTLESS_PARTICLE_DURATION_MS}ms ease-out ${p.delay}ms forwards`,
            // @ts-expect-error CSS custom properties
            "--tx": `${p.tx}px`,
            "--ty": `${p.ty}px`,
          }}
        />
      ))}
    </div>
  );
}

function ItemSlot({ item, onUse }: { item: Item; onUse: () => void }) {
  const [hovered, setHovered] = useState(false);
  const def = ITEM_DEFS[item.id as ItemId];
  const isPassive = def?.passive === true;
  const burstKey = usePointlessParticles(item);

  const description =
    item.id === "pointless_potion" && item.pricePaid
      ? pointlessPotionDesc(item.pricePaid)
      : def?.description;

  return (
    <div style={{ position: "relative" }}>
      {burstKey !== null && <PointlessParticleBurst burstKey={burstKey} />}
      <div
        className="upgrade-card"
        style={{
          ...SLOT_STYLE,
          cursor: isPassive ? "default" : "pointer",
          boxShadow: isPassive && hovered ? "0 0 8px 2px #6cde6c55" : undefined,
        }}
        onClick={isPassive ? undefined : onUse}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <ItemIcon itemId={item.id as ItemId} size={36} />
        {def && (
          <div lang="de" style={{ ...NAME_STYLE, color: "#c8a84b" }}>
            {def.name}
          </div>
        )}
      </div>
      {hovered && def && (
        <div
          className="panel-pixel"
          style={{
            position: "absolute",
            left: "calc(100% + 8px)",
            top: 0,
            width: 168,
            padding: "8px 10px",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 10,
              color: "#c8a84b",
            }}
          >
            {def.name}
          </div>
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 6,
              color: "#a08060",
              lineHeight: 1.6,
            }}
          >
            {description}
          </div>
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 7,
              color: isPassive ? "#6cde6c" : "#e0c060",
            }}
          >
            {isPassive ? "Passiv – Immer aktiv" : "Klicken zum Benutzen"}
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveSlot({ effect, now }: { effect: ActiveEffect; now: number }) {
  const [hovered, setHovered] = useState(false);
  const def = ITEM_DEFS[effect.itemId as ItemId];
  const remaining = Math.max(0, Math.ceil(((effect.endsAt ?? 0) - now) / 1000));

  return (
    <div style={{ position: "relative" }}>
      <div
        className="upgrade-card"
        style={{ ...SLOT_STYLE, cursor: "default" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{ position: "relative", display: "flex" }}>
          <div style={{ opacity: 0.3 }}>
            <ItemIcon itemId={effect.itemId as ItemId} size={36} />
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 8,
              color: "#fff",
              textShadow: "0 0 4px #000, 0 0 8px #000",
            }}
          >
            {remaining}s
          </div>
        </div>
        {def && (
          <div lang="de" style={{ ...NAME_STYLE, color: "#6a5030" }}>
            {def.name}
          </div>
        )}
      </div>
      {hovered && def && (
        <div
          className="panel-pixel"
          style={{
            position: "absolute",
            left: "calc(100% + 8px)",
            top: 0,
            width: 168,
            padding: "8px 10px",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 10,
              color: "#c8a84b",
            }}
          >
            {def.name}
          </div>
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 6,
              color: "#a08060",
              lineHeight: 1.6,
            }}
          >
            {def.description}
          </div>
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 7,
              color: "#6cde6c",
            }}
          >
            Aktiv: {remaining}s
          </div>
        </div>
      )}
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="upgrade-card" style={SLOT_STYLE}>
      <ItemIcon size={36} />
    </div>
  );
}

export function ItemBar() {
  const game = useGameStore((s) => s.game);
  const playerId = useConnectionStore((s) => s.playerId);
  const send = useConnectionStore((s) => s.send);
  const now = useNow(1_000);
  const targetingStart = useTargetingStore((s) => s.start);
  const revealed = useRevealedSurfaces();

  const me = playerId ? game?.players[playerId] : null;
  const opponent =
    Object.values(game?.players ?? {}).find((p) => p.id !== playerId) ?? null;

  if (!me) return null;
  if (!revealed.has("itemBar")) return null;

  const heldItems = me.items.filter((i) => i.count > 0);

  // Effects I cast on the opponent that are still running → shown as faded timer slots
  const activeSourceEffects = (opponent?.activeEffects ?? []).filter(
    (e) =>
      e.sourcePlayerId === playerId &&
      e.endsAt !== null &&
      (e.endsAt ?? 0) > now &&
      !heldItems.some((i) => i.id === e.itemId),
  );

  // Build 3 slots: held items first, then active-effect placeholders, then empty
  type Slot =
    | { kind: "held"; item: Item }
    | { kind: "active"; effect: ActiveEffect }
    | { kind: "empty" };

  const slots: Slot[] = [
    ...heldItems.slice(0, 3).map((item) => ({ kind: "held" as const, item })),
    ...activeSourceEffects
      .slice(0, 3 - Math.min(heldItems.length, 3))
      .map((effect) => ({ kind: "active" as const, effect })),
  ];
  while (slots.length < 3) slots.push({ kind: "empty" });

  const handleUse = (item: Item) => {
    const def = ITEM_DEFS[item.id as ItemId];
    const targetType = def?.target ?? "none";
    if (targetType === "none") {
      send?.({
        type: "player_action",
        action: { kind: "UseItem", itemId: item.id as ItemId },
      });
    } else if (targetType === "opponent_field") {
      targetingStart(1, (indices) => {
        send?.({
          type: "player_action",
          action: {
            kind: "UseItem",
            itemId: item.id as ItemId,
            targetFieldIndex: indices[0],
          },
        });
      });
    } else if (targetType === "own_and_opponent_field") {
      targetingStart(
        1,
        (ownIndices) => {
          targetingStart(
            1,
            (oppIndices) => {
              send?.({
                type: "player_action",
                action: {
                  kind: "UseItem",
                  itemId: item.id as ItemId,
                  targetFieldIndex: ownIndices[0],
                  secondTargetFieldIndex: oppIndices[0],
                },
              });
            },
            false,
          );
        },
        true,
      );
    }
  };

  return (
    <>
      <style>{`
      @keyframes pointless-particle {
        0%   { transform: translate(-50%, -50%) scale(0); opacity: 0; }
        15%  { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
        100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0.2); opacity: 0; }
      }
    `}</style>
      <div
        data-tutorial-id="itemBar"
        className="absolute"
        style={{
          left: 16,
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          alignItems: "flex-start",
          pointerEvents: "auto",
        }}
      >
        {slots.map((slot, i) => {
          if (slot.kind === "held")
            return (
              <ItemSlot
                key={i}
                item={slot.item}
                onUse={() => handleUse(slot.item)}
              />
            );
          if (slot.kind === "active")
            return <ActiveSlot key={i} effect={slot.effect} now={now} />;
          return <EmptySlot key={i} />;
        })}
      </div>
    </>
  );
}
