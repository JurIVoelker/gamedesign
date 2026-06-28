import type { GameState, ClientMessage } from "@gamedesign/shared";

export type TutorialSurface =
  | "goldHud"
  | "effectsTimeline"
  | "matchTimer"
  | "exitButton"
  | "toolsCard"
  | "fertilizerCard"
  | "crowsCard"
  | "thiefCard"
  | "weatherCard"
  | "itemBar"
  | "opponentFarm"
  | "villagers"
  | "villagerAccuse"
  | "thiefEntity"
  | "merchant"
  | "crystalBall";

export type HighlightTarget =
  | { kind: "dom"; id: string }
  | { kind: "field"; owner: "player" | "opponent"; index: number };

export type SendFn = ((msg: ClientMessage) => void) | null;

/**
 * Interactions the tutorial can restrict per step. A step's `allow` list names
 * exactly which of these are enabled; anything interactive but not listed is
 * disabled (greyed). Farming the player's own fields (sow/harvest) is never
 * governed here — it stays available.
 */
export type TutorialInteraction =
  | "upgrade:tools"
  | "upgrade:fertilizer"
  | "upgrade:crows"
  | "upgrade:thief"
  | "upgrade:weather"
  | "sendCrows"
  | "sendThief"
  | "sendWeather"
  | "scareCrow"
  | "accuse";

export interface TutorialStep {
  text: string;
  reveals?: TutorialSurface[];
  highlight?: HighlightTarget;
  /**
   * Whitelist of interactions enabled on this step. When defined, every
   * interaction NOT listed is disabled. When undefined, all interactions are
   * enabled (unrestricted — used for free-play and Stage 1).
   */
  allow?: TutorialInteraction[];
  /** Returns true when the step should auto-advance */
  gate?: (game: GameState | null) => boolean;
  /** Called when this step becomes active */
  onEnter?: (send: SendFn) => void;
  /** Shows a named action button instead of "Weiter"; does NOT auto-advance */
  readyButton?: { label: string; action: (send: SendFn) => void };
}
