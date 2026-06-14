import type { ItemId } from "@gamedesign/shared";

function Svg({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="geometricPrecision"
    >
      {children}
    </svg>
  );
}

/**
 * Shared round-bottom flask. `fluid` overrides the default single-colour
 * liquid; `overlay` draws symbols/bubbles clipped inside the glass body.
 */
function PotionBottle({
  size,
  idKey,
  dark,
  light,
  level = 14.5,
  fluid,
  overlay,
}: {
  size: number;
  idKey: string;
  dark?: string;
  light?: string;
  level?: number;
  fluid?: React.ReactNode;
  overlay?: React.ReactNode;
}) {
  const clipId = `pclip-${idKey}`;
  return (
    <Svg size={size}>
      {/* cork */}
      <rect x="12.5" y="2.5" width="7" height="5" rx="1.5" fill="#a06a38" stroke="#5e3a18" strokeWidth="1" />
      <ellipse cx="16" cy="3.3" rx="3.3" ry="1.1" fill="#c89060" />
      {/* neck */}
      <path d="M13 7 L13.2 12 Q13.3 13 14.3 13 L17.7 13 Q18.7 13 18.8 12 L19 7 Z" fill="#d2e8ee" stroke="#33403a" strokeWidth="1" />
      {/* glass body */}
      <circle cx="16" cy="20" r="10" fill="#e2f0f4" stroke="#33403a" strokeWidth="1.2" />
      {/* liquid */}
      <clipPath id={clipId}>
        <circle cx="16" cy="20" r="9.1" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {fluid ?? (
          <>
            <rect x="5" y={level} width="22" height="22" fill={dark} />
            <ellipse cx="16" cy={level} rx="11" ry="2" fill={light} />
          </>
        )}
        {overlay}
      </g>
      {/* glass shine */}
      <path d="M10 14.5 Q7.5 19 9.5 24.5" stroke="#ffffff" strokeWidth="2" opacity="0.5" fill="none" strokeLinecap="round" />
      <circle cx="12.5" cy="15.5" r="1.2" fill="#ffffff" opacity="0.55" />
    </Svg>
  );
}

function BlindnessPotionIcon({ size }: { size: number }) {
  return (
    <PotionBottle
      size={size}
      idKey="blind"
      dark="#3a1262"
      light="#6a2c9c"
      overlay={
        <>
          <circle cx="12.5" cy="22.5" r="1.5" fill="#a86ad8" opacity="0.7" />
          <circle cx="19" cy="24" r="1.1" fill="#a86ad8" opacity="0.6" />
          <circle cx="16.5" cy="20" r="0.9" fill="#c89aec" opacity="0.6" />
          <path d="M10 18 Q16 16 22 18" stroke="#1a0533" strokeWidth="1.4" fill="none" opacity="0.5" />
        </>
      }
    />
  );
}

function PointlessPotionIcon({ size }: { size: number }) {
  return (
    <PotionBottle
      size={size}
      idKey="point"
      dark="#e0a818"
      light="#ffd95a"
      overlay={
        <>
          <path d="M16 17 l0.9 2.4 l2.4 0.9 l-2.4 0.9 l-0.9 2.4 l-0.9 -2.4 l-2.4 -0.9 l2.4 -0.9 z" fill="#fff7d0" opacity="0.9" />
          <circle cx="12" cy="24" r="1.1" fill="#fff2a0" opacity="0.7" />
          <circle cx="20" cy="23" r="0.9" fill="#fff2a0" opacity="0.6" />
        </>
      }
    />
  );
}

function SwapPotionIcon({ size }: { size: number }) {
  return (
    <PotionBottle
      size={size}
      idKey="swap"
      dark="#2f9040"
      light="#5fbf5f"
      overlay={
        <>
          {/* top arrow → right */}
          <path d="M9 18 H18 V16 L22 19 L18 22 V20 H9 Z" fill="#eafff0" stroke="#1f5a2a" strokeWidth="0.5" />
          {/* bottom arrow ← left */}
          <path d="M23 24 H14 V26 L10 23 L14 20 V22 H23 Z" fill="#eafff0" stroke="#1f5a2a" strokeWidth="0.5" />
        </>
      }
    />
  );
}

function HalvingBrewIcon({ size }: { size: number }) {
  return (
    <PotionBottle
      size={size}
      idKey="halve"
      fluid={
        <>
          <rect x="5" y="14.5" width="11" height="22" fill="#e0a818" />
          <rect x="16" y="14.5" width="11" height="22" fill="#1f6f5a" />
          <ellipse cx="10.5" cy="14.5" rx="6" ry="1.8" fill="#ffd95a" />
          <ellipse cx="21.5" cy="14.5" rx="6" ry="1.8" fill="#3f9f86" />
          <rect x="15.3" y="12" width="1.4" height="24" fill="#0d2a22" opacity="0.65" />
        </>
      }
    />
  );
}

function ParanoiaCurseIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      {/* eye white almond */}
      <path d="M3 16 Q16 5.5 29 16 Q16 26.5 3 16 Z" fill="#f4ecd6" stroke="#3a2a18" strokeWidth="1.4" />
      {/* bloodshot veins */}
      <path d="M4.5 16 Q8 15 11 16" stroke="#c83838" strokeWidth="0.8" fill="none" opacity="0.8" />
      <path d="M27.5 16 Q24 17.4 21 16.4" stroke="#c83838" strokeWidth="0.8" fill="none" opacity="0.8" />
      <path d="M6 13.5 Q9 14.6 11.5 14.2" stroke="#c83838" strokeWidth="0.6" fill="none" opacity="0.7" />
      {/* iris — pupil shifted (shifty/paranoid) */}
      <circle cx="17" cy="16" r="6.6" fill="#3a8a6a" stroke="#1f4a38" strokeWidth="1" />
      <circle cx="18.4" cy="16" r="3" fill="#101010" />
      <circle cx="16.8" cy="14.6" r="1.1" fill="#ffffff" opacity="0.9" />
      {/* nervous sweat drop */}
      <path d="M25.5 7 Q27 10 25.5 11.2 Q24 10 25.5 7 Z" fill="#7ac0e8" stroke="#3a7a9a" strokeWidth="0.6" />
      {/* creeping tendrils */}
      <path d="M5 21.5 Q7 25 5 28.5" stroke="#5a2a6a" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M27 21.5 Q25 25 27 28.5" stroke="#5a2a6a" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M16 23.5 Q15 27 17 29.5" stroke="#5a2a6a" strokeWidth="2" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function CrystalBallIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      {/* stand */}
      <rect x="8" y="27" width="16" height="3" rx="1.5" fill="#7a5018" stroke="#3a2408" strokeWidth="1" />
      <path d="M10.5 27 Q9.5 22.5 12.5 21" stroke="#caa24a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M21.5 27 Q22.5 22.5 19.5 21" stroke="#caa24a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M16 27 L16 21.5" stroke="#caa24a" strokeWidth="2.2" strokeLinecap="round" />
      {/* orb layers */}
      <circle cx="16" cy="13.5" r="11" fill="#5a86c8" stroke="#2a3a5a" strokeWidth="1.2" />
      <circle cx="16" cy="13.5" r="8.5" fill="#7aa6e0" />
      <circle cx="16" cy="13.5" r="5" fill="#aacef4" />
      {/* inner swirl */}
      <path d="M16 13.5 Q20 11.5 18.5 8.5" stroke="#ffffff" strokeWidth="1" fill="none" opacity="0.4" />
      {/* sparkles */}
      <path d="M11.5 8 l0.8 2 l2 0.8 l-2 0.8 l-0.8 2 l-0.8 -2 l-2 -0.8 l2 -0.8 z" fill="#ffffff" opacity="0.85" />
      <circle cx="21" cy="10.5" r="1" fill="#ffffff" opacity="0.7" />
      <circle cx="13" cy="18" r="0.8" fill="#ffffff" opacity="0.6" />
      {/* big highlight */}
      <ellipse cx="11.5" cy="9.5" rx="2.4" ry="3.4" fill="#ffffff" opacity="0.35" transform="rotate(-22 11.5 9.5)" />
    </Svg>
  );
}

function SpyGlassIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      <g transform="rotate(-28 16 16)">
        {/* eyepiece */}
        <rect x="3" y="13" width="5" height="6" rx="1" fill="#8a5a14" stroke="#4a2e08" strokeWidth="1" />
        {/* mid tube */}
        <rect x="7" y="12.5" width="9" height="7" fill="#caa24a" stroke="#4a2e08" strokeWidth="1" />
        <rect x="7" y="13" width="9" height="1.8" fill="#e8c878" opacity="0.7" />
        {/* wide tube */}
        <rect x="15" y="11.5" width="9" height="9" rx="1" fill="#b8902e" stroke="#4a2e08" strokeWidth="1" />
        <rect x="15" y="12" width="9" height="2" fill="#e0c060" opacity="0.7" />
        {/* objective ring + lens */}
        <rect x="23" y="10.5" width="4" height="11" rx="1.5" fill="#caa24a" stroke="#4a2e08" strokeWidth="1" />
        <ellipse cx="26.5" cy="16" rx="2.1" ry="4.8" fill="#7ec0f0" />
        <ellipse cx="26" cy="14" rx="0.8" ry="1.7" fill="#ffffff" opacity="0.8" />
      </g>
    </Svg>
  );
}

function FakeMerchantIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      {/* sack body */}
      <path d="M7 16 Q7 29 16 29 Q25 29 25 16 Q25 11 20 10 L12 10 Q7 11 7 16 Z" fill="#b07b34" stroke="#5e3e14" strokeWidth="1.2" />
      <path d="M10 16 Q10 26 16 26.5" stroke="#caa05a" strokeWidth="1.4" fill="none" opacity="0.5" />
      {/* tied neck */}
      <path d="M11 10 Q16 6.5 21 10 L19 12.5 Q16 10.5 13 12.5 Z" fill="#caa05a" stroke="#5e3e14" strokeWidth="1" />
      <rect x="14.2" y="5.5" width="3.6" height="4.5" rx="1" fill="#caa05a" stroke="#5e3e14" strokeWidth="0.9" />
      {/* domino mask — disguise */}
      <path d="M8.5 16 Q16 12.5 23.5 16 Q23 19.5 20.5 19.5 Q18.5 19.5 18 17.8 Q16 16.8 14 17.8 Q13.5 19.5 11.5 19.5 Q9 19.5 8.5 16 Z" fill="#241a2e" />
      {/* shifty eyes */}
      <ellipse cx="12.4" cy="16.6" rx="1.5" ry="1.1" fill="#ffffff" />
      <ellipse cx="19.6" cy="16.6" rx="1.5" ry="1.1" fill="#ffffff" />
      <circle cx="13.1" cy="16.6" r="0.7" fill="#101010" />
      <circle cx="20.3" cy="16.6" r="0.7" fill="#101010" />
      {/* smirk */}
      <path d="M13 23 Q16 25.5 19.5 22.5" stroke="#5e3e14" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      {/* coin sparkle */}
      <circle cx="22.5" cy="13" r="1" fill="#fff080" opacity="0.85" />
    </Svg>
  );
}

function MirrorCurseIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
      {/* handle */}
      <rect x="14" y="20" width="4" height="9" rx="2" fill="#caa24a" stroke="#5e3e14" strokeWidth="1" />
      <rect x="12.8" y="27" width="6.4" height="3" rx="1.5" fill="#e0c060" stroke="#5e3e14" strokeWidth="1" />
      {/* frame */}
      <circle cx="16" cy="12" r="10" fill="#caa24a" stroke="#5e3e14" strokeWidth="1.2" />
      <circle cx="16" cy="12" r="7.6" fill="#1a2a3a" />
      {/* glass */}
      <circle cx="16" cy="12" r="7" fill="#9ac4e4" />
      {/* reflection sheen */}
      <path d="M11 7 L17 13 M13.5 6 L20 12.5 M10 11 L15 16" stroke="#ffffff" strokeWidth="1.2" opacity="0.55" strokeLinecap="round" />
      {/* frame ornaments */}
      <circle cx="16" cy="2.3" r="1.4" fill="#e0c060" stroke="#5e3e14" strokeWidth="0.6" />
      <circle cx="6.4" cy="9" r="1" fill="#e0c060" />
      <circle cx="25.6" cy="9" r="1" fill="#e0c060" />
    </Svg>
  );
}

function EmptySlotIcon({ size }: { size: number }) {
  return (
    <Svg size={size}>
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
    </Svg>
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
  switch (itemId) {
    case "blindness_potion":
      return <BlindnessPotionIcon size={size} />;
    case "paranoia_curse":
      return <ParanoiaCurseIcon size={size} />;
    case "crystal_ball":
      return <CrystalBallIcon size={size} />;
    case "swap_potion":
      return <SwapPotionIcon size={size} />;
    case "mirror_curse":
      return <MirrorCurseIcon size={size} />;
    case "fake_merchant":
      return <FakeMerchantIcon size={size} />;
    case "spy_glass":
      return <SpyGlassIcon size={size} />;
    case "pointless_potion":
      return <PointlessPotionIcon size={size} />;
    case "halving_brew":
      return <HalvingBrewIcon size={size} />;
    default:
      return <EmptySlotIcon size={size} />;
  }
}
