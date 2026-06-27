import type { Game } from './game.js';

// Bot tuning constants
const BOT_SOW_CHANCE_PER_TICK = 0.75;
const BOT_HARVEST_CHANCE_PER_TICK = 0.90;
const BOT_DEFAULT_CROP_TYPE = "wheat";

export class BotController {
  private game: Game;
  private botId: string;

  constructor(game: Game, botId: string) {
    this.game = game;
    this.botId = botId;
  }

  tick(_now: number): void {
    if (this.game.isTutorial()) return;
    const state = this.game.getState();
    if (!state || state.phase !== "playing") return;

    const botState = state.players[this.botId];
    if (!botState) return;

    for (const field of botState.fields) {
      if (field.stage === "empty" && Math.random() < BOT_SOW_CHANCE_PER_TICK) {
        this.game.sowField(this.botId, field.index, BOT_DEFAULT_CROP_TYPE);
      } else if (field.stage === "ready" && Math.random() < BOT_HARVEST_CHANCE_PER_TICK) {
        this.game.harvestField(this.botId, field.index);
      }
    }
  }

  // Scripted tutorial beats triggered by client tutorial_cue messages.
  // Filled per stage in later plans.
  handleCue(_cue: string, _level?: number): void {}
}
