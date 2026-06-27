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

export interface TutorialStep {
  text: string;
  reveals?: TutorialSurface[];
  highlight?: HighlightTarget;
  /** Returns true when the step should auto-advance */
  gate?: (game: GameState | null) => boolean;
  /** Called when this step becomes active */
  onEnter?: (send: SendFn) => void;
}
