import { useEffect, useRef } from "react";
import type { MerchantVisit } from "@gamedesign/shared";
import { ITEM_DEFS } from "@gamedesign/shared";
import { useConnectionStore } from "../state/connectionStore";
import { useGameStore } from "../state/gameStore";
import { useNow } from "../hooks/useNow";
import { ItemIcon } from "./ItemIcons";

interface Props {
  visit: MerchantVisit;
  gold: number;
  onBuy: (itemId: string) => void;
  onDismiss: () => void;
}

export function MerchantShopModal({ visit, gold, onBuy, onDismiss }: Props) {
  const now = useNow(1_000);
  const countdown = Math.max(0, Math.ceil((visit.leavesAt - now) / 1000));
  const send = useConnectionStore((s) => s.send);
  const playerId = useConnectionStore((s) => s.playerId);
  const myItems = useGameStore(
    (s) => s.game?.players[playerId ?? ""]?.items ?? [],
  );
  const sentOpen = useRef(false);

  // Notify server when window opens / closes
  useEffect(() => {
    if (!sentOpen.current) {
      sentOpen.current = true;
      send?.({ type: "merchant_window", open: true });
    }
    return () => {
      send?.({ type: "merchant_window", open: false });
    };
  }, [send]);

  // ESC dismisses
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDismiss]);

  const isOverdue = countdown === 0;
  const alreadyBought = visit.offers.some((o) => o.bought);

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 40,
        width: 340,
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
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            className="text-gold"
            style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8 }}
          >
            Wandernder Händler
          </div>
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 8,
              color: isOverdue
                ? "#a89060"
                : countdown <= 10
                  ? "#d04040"
                  : "#a89060",
            }}
          >
            {isOverdue ? "wartet…" : `${countdown}s`}
          </div>
        </div>

        {/* Merchant notice (fake merchant speech, etc.) */}
        {visit.notice && (
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 7,
              color: "#c8a84b",
              lineHeight: 1.6,
            }}
          >
            "{visit.notice}"
          </div>
        )}

        {/* One-item-per-visit rule */}
        <div
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 6,
            color: alreadyBought ? "#6cde6c" : "#888",
          }}
        >
          {alreadyBought ? "✓ Artikel gekauft" : "Nur 1 Artikel pro Besuch"}
        </div>

        {/* Discount badge */}
        {visit.discountPct > 0 && (
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 7,
              color: "#6cde6c",
            }}
          >
            ★ {Math.round(visit.discountPct * 100)}% Rabatt (Aufholjagd)
          </div>
        )}

        {/* Offer rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visit.offers.map((offer) => {
            const def = ITEM_DEFS[offer.itemId];
            const canAfford = gold >= offer.price;
            const isDiscount = offer.price < offer.basePrice;
            const inventoryFull =
              !visit.fake && myItems.filter((i) => i.count > 0).length >= 3;
            const alreadyHave =
              !visit.fake &&
              myItems.some((i) => i.id === offer.itemId && i.count > 0);
            return (
              <div
                key={offer.itemId}
                className="score-row"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  opacity: offer.bought ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <ItemIcon itemId={offer.itemId} size={28} />
                  <span
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 7,
                      flex: 1,
                      color: "#e8d8a0",
                    }}
                  >
                    {def?.name ?? offer.itemId}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 7,
                      color: isDiscount ? "#6cde6c" : "#c8a84b",
                      minWidth: 48,
                      textAlign: "right",
                    }}
                  >
                    {isDiscount && (
                      <span
                        style={{
                          textDecoration: "line-through",
                          color: "#888",
                          marginRight: 4,
                        }}
                      >
                        {offer.basePrice}g
                      </span>
                    )}
                    {offer.price}g
                  </span>
                  <button
                    className="btn-pixel"
                    style={{ fontSize: 6, padding: "3px 8px", minWidth: 60 }}
                    disabled={
                      alreadyBought ||
                      !canAfford ||
                      inventoryFull ||
                      alreadyHave
                    }
                    onClick={() => onBuy(offer.itemId)}
                  >
                    {offer.bought ? "Gekauft" : "Kaufen"}
                  </button>
                </div>
                {def?.description && (
                  <div
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 5,
                      color: "#6a5030",
                      lineHeight: 1.6,
                    }}
                  >
                    {def.description}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Overdone hint */}
        {isOverdue && (
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 7,
              color: "#a89060",
              textAlign: "center",
            }}
          >
            Der Händler wartet ungeduldig…
          </div>
        )}

        <button
          className="btn-pixel-secondary"
          style={{ fontSize: 7 }}
          onClick={onDismiss}
        >
          Schließen [ESC]
        </button>
      </div>
    </div>
  );
}
