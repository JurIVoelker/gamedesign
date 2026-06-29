import type { ItemId } from "@gamedesign/shared";

// A server-side bot opponent that drives one slot of a Game. Both the scripted
// tutorial bot (BotController) and the autonomous test-match bot
// (MatchBotController) implement this so a Game can hold either one.
export interface BotBrain {
  readonly botId: string;
  // Called every server tick (~1s) while the match is playing.
  tick(now: number): void;
  // Scripted tutorial cues (tutorial bot only).
  handleCue?(cue: string, level?: number, itemId?: ItemId): void;
  // Clears any transient state (e.g. scheduled reaction timers) on play-again.
  reset?(): void;
}
