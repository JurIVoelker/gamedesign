import { useState } from "react";
import type { Item, ActiveEffect, ItemId } from "@gamedesign/shared";
import { ITEM_DEFS } from "@gamedesign/shared";
import { useConnectionStore } from "../state/connectionStore";
import { useGameStore } from "../state/gameStore";
import { useTargetingStore } from "../state/targetingStore";
import { useNow } from "../hooks/useNow";
import { ItemIcon } from "./ItemIcons";

const SLOT_STYLE = {
  width: 72,
  minHeight: 72,
  padding: "6px 4px",
  minWidth: "unset",
  justifyContent: "center",
  gap: 4,
} as const;

const NAME_STYLE = {
  fontFamily: "'Press Start 2P', monospace",
  fontSize: 5,
  textAlign: "center" as const,
  lineHeight: 1.4,
  overflowWrap: "break-word" as const,
  hyphens: "auto" as const,
  maxWidth: 64,
};

function ItemSlot({
  item,
  onUse,
}: {
  item: Item;
  onUse: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const def = ITEM_DEFS[item.id as ItemId];

  return (
    <div style={{ position: "relative" }}>
      <div
        className="upgrade-card"
        style={{ ...SLOT_STYLE, cursor: "pointer" }}
        onClick={onUse}
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
              fontSize: 7,
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
              fontSize: 5,
              color: "#555",
            }}
          >
            Klicken zum Benutzen
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveSlot({
  effect,
  now,
}: {
  effect: ActiveEffect;
  now: number;
}) {
  const [hovered, setHovered] = useState(false);
  const def = ITEM_DEFS[effect.itemId as ItemId];
  const remaining = Math.max(
    0,
    Math.ceil(((effect.endsAt ?? 0) - now) / 1000),
  );

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
              fontSize: 7,
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
              fontSize: 5,
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

  const me = playerId ? game?.players[playerId] : null;
  const opponent =
    Object.values(game?.players ?? {}).find((p) => p.id !== playerId) ?? null;

  if (!me) return null;

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
    <div
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
  );
}
