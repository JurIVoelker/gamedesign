import type { ItemId } from "@gamedesign/shared";

function EmptySlotIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="2"
        fill="none"
        stroke="#3a2010"
        strokeWidth="2"
        strokeDasharray="4 3"
        opacity="0.4"
      />
    </svg>
  );
}

export function ItemIcon({
  itemId,
  size = 32,
}: {
  itemId?: ItemId;
  size?: number;
}) {
  if (!itemId) return <EmptySlotIcon size={size} />;
  return (
    <img
      src={`/assets/item-${itemId}.png`}
      width={size}
      height={size}
      alt={itemId}
      style={{
        imageRendering: "pixelated",
        filter:
          "drop-shadow(0 1px 0 #ffd700) drop-shadow(0 -1px 0 #ffd700) drop-shadow(1px 0 0 #ffd700) drop-shadow(-1px 0 0 #ffd700)",
      }}
    />
  );
}
