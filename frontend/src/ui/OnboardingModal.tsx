import { useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SLIDES = [
  {
    title: "Übersicht",
    bullets: [
      "Zwei Bauern, ein Sieger.",
      "Ernte Weizen und sammle Gold.",
      "Wer am Ende mehr Gold hat, gewinnt.",
    ],
  },
  {
    title: "Deine Farm",
    bullets: [
      "4 Felder: Aussäen → Wachsen → Ernten.",
      "Jede Ernte bringt Gold.",
      "Verbessere Säen, Ernten und Dünger für mehr Effizienz.",
    ],
  },
  {
    title: "Sabotage",
    bullets: [
      "Krähen fressen das Getreide deines Gegners.",
      "Ein Dieb stiehlt Gold direkt aus der Kasse.",
      "Schlechtes Wetter verlangsamt Wachstum und Aktionen.",
      "Upgrades schalten diese Aktionen frei.",
    ],
  },
  {
    title: "Gegenwehr",
    bullets: [
      "Krähen auf deinem Feld? Klick drauf, um sie zu verscheuchen.",
      "Dieb am Stehlen? Klick auf ihn, um ihn zu verjagen.",
      "Reagiere schnell — jede Sekunde zählt!",
    ],
  },
];

export function OnboardingModal({ open, onClose }: Props) {
  const [slide, setSlide] = useState(0);

  if (!open) return null;

  const current = SLIDES[slide];
  const isLast = slide === SLIDES.length - 1;

  function handleNext() {
    if (isLast) {
      onClose();
      setSlide(0);
    } else {
      setSlide((s) => s + 1);
    }
  }

  function handleBack() {
    setSlide((s) => s - 1);
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/60">
      <div className="panel-pixel flex flex-col gap-4 text-parchment" style={{ minWidth: 260, maxWidth: 320, padding: 24 }}>
        <div className="relative flex flex-col items-center gap-1">
          <button
            onClick={() => { onClose(); setSlide(0); }}
            className="absolute -top-1 -right-1 text-muted-gold hover:text-gold text-[14px] leading-none cursor-pointer"
            title="Schließen"
          >
            ✕
          </button>
          <h2 className="text-gold text-center text-[11px] tracking-wide">
            {current.title}
          </h2>
        </div>

        <ul className="flex flex-col gap-2">
          {current.bullets.map((b, i) => (
            <li key={i} className="text-parchment text-[8px] flex gap-2">
              <span className="text-muted-gold shrink-0">›</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between mt-1">
          <div className="flex gap-1">
            {SLIDES.map((_, i) => (
              <div
                key={i}
                className="w-2 h-2"
                style={{
                  background: i === slide ? "var(--color-gold, #ffd700)" : "var(--color-muted-gold, #8a7040)",
                  imageRendering: "pixelated",
                }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {slide > 0 && (
              <button onClick={handleBack} className="btn-pixel-secondary">
                Zurück
              </button>
            )}
            <button onClick={handleNext} className="btn-pixel">
              {isLast ? "Los geht's!" : "Weiter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
