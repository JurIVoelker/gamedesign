import { useState, useEffect } from "react";
import type { Item, ActiveEffect, ItemId } from "@gamedesign/shared";
import { ITEM_DEFS, SPY_REPORT_INTERVAL_MS } from "@gamedesign/shared";
import { useConnectionStore } from "../state/connectionStore";
import { useGameStore } from "../state/gameStore";
import { useTargetingStore } from "../state/targetingStore";
import { useNow } from "../hooks/useNow";

function EffectChip({ effect, now }: { effect: ActiveEffect; now: number }) {
  const remaining = effect.endsAt
    ? Math.max(0, Math.ceil((effect.endsAt - now) / 1000))
    : null;
  const def = ITEM_DEFS[effect.itemId];
  return (
    <div
      className="upgrade-card text-parchment"
      style={{ padding: "4px 8px", minWidth: "unset", gap: 4 }}
    >
      <div
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 6,
          color: "#c8a84b",
        }}
      >
        {def?.name ?? effect.itemId}
      </div>
      <div
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 6,
          color: "#888",
        }}
      >
        {remaining !== null ? `${remaining}s` : "bis Spielende"}
      </div>
    </div>
  );
}

function SpyChip({ effect, now }: { effect: ActiveEffect; now: number }) {
  const [displayedGold, setDisplayedGold] = useState<number | null>(null);

  useEffect(() => {
    const snapshot = () => {
      const { game } = useGameStore.getState();
      const { playerId } = useConnectionStore.getState();
      const opponentId = Object.keys(game?.players ?? {}).find(
        (id) => id !== playerId,
      );
      if (opponentId != null && game) {
        setDisplayedGold(game.players[opponentId]?.gold ?? null);
      }
    };
    snapshot();
    const id = setInterval(snapshot, SPY_REPORT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const remaining = effect.endsAt
    ? Math.max(0, Math.ceil((effect.endsAt - now) / 1000))
    : null;

  return (
    <div
      className="upgrade-card text-parchment"
      style={{ padding: "4px 8px", minWidth: "unset", gap: 4 }}
    >
      <div
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 6,
          color: "#c8a84b",
        }}
      >
        {"\u{1F575}️"} Gegner:{" "}
        {displayedGold !== null ? `${displayedGold} G` : "?"}
      </div>
      {remaining !== null && (
        <div
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 6,
            color: "#888",
          }}
        >
          {remaining}s
        </div>
      )}
    </div>
  );
}

function ItemCard({ item, isActive }: { item: Item; isActive: boolean }) {
  const send = useConnectionStore((s) => s.send);
  const def = ITEM_DEFS[item.id as ItemId];
  const targetType = def?.target ?? "none";
  const targetingStart = useTargetingStore((s) => s.start);

  const handleUse = () => {
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
      // Phase 1: pick own field; phase 2: pick opponent field
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
      className="upgrade-card text-parchment flex flex-col items-center gap-2"
      style={{ minWidth: "unset", padding: "6px 10px" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 6,
            color: "#c8a84b",
          }}
        >
          {def?.name ?? item.id}
        </span>
        <span
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 6,
            color: "#e8d8a0",
          }}
        >
          ×{item.count}
        </span>
      </div>
      <button
        className="btn-upgrade-action"
        style={{ fontSize: 6, padding: "2px 8px", width: "100%" }}
        disabled={item.count <= 0 || isActive}
        onClick={handleUse}
      >
        {isActive ? "Aktiv" : "Benutzen"}
      </button>
    </div>
  );
}

export function ItemBar() {
  const game = useGameStore((s) => s.game);
  const playerId = useConnectionStore((s) => s.playerId);
  const now = useNow(1_000);

  const me = playerId ? game?.players[playerId] : null;
  const opponent =
    Object.values(game?.players ?? {}).find((p) => p.id !== playerId) ?? null;

  const items = me?.items.filter((i) => i.count > 0) ?? [];
  const ownEffects = me?.activeEffects ?? [];
  // Effects this player cast on the opponent (visible via visibility:'source')
  const sourceEffects = (opponent?.activeEffects ?? []).filter(
    (e) => e.sourcePlayerId === playerId,
  );
  const effects = [...ownEffects, ...sourceEffects];
  const activeItemIds = new Set(effects.map((e) => e.itemId));

  if (items.length === 0 && effects.length === 0) return null;

  return (
    <div
      className="absolute"
      style={{
        bottom: 160,
        right: 16,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "flex-end",
        pointerEvents: "auto",
      }}
    >
      {effects.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {effects.map((e) =>
            e.itemId === "spy_glass" ? (
              <SpyChip key={e.id} effect={e} now={now} />
            ) : (
              <EffectChip key={e.id} effect={e} now={now} />
            ),
          )}
        </div>
      )}
      {items.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              isActive={activeItemIds.has(item.id as ItemId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
