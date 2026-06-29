import type { PlayerAction } from "./actions.js";
import type { GameState } from "./game-state.js";
import type { TutorialStageId } from "../tutorial.js";
import type { ItemId } from "../constants.js";

// ---------------------------------------------------------------------------
// Client → Server
// ---------------------------------------------------------------------------

export type HelloMsg = { type: "hello"; playerId: string; roomCode?: string };
export type CreateRoomMsg = { type: "create_room" };
export type PlayAgainMsg = { type: "play_again" };
export type PlayerActionMsg = { type: "player_action"; action: PlayerAction };
export type PongMsg = { type: "pong" };
export type LeaveGameMsg = { type: "leave_game" };
export type VillagersMsg = { type: "villagers"; count: number };
export type MerchantWindowMsg = { type: "merchant_window"; open: boolean };

export type StartTutorialMsg = { type: "start_tutorial"; stage: TutorialStageId };
export type StartBotMatchMsg = { type: "start_bot_match" };
export type TutorialCueMsg = {
  type: "tutorial_cue";
  cue: string;
  level?: number;
  itemId?: ItemId;
};

export type ClientMessage =
  | HelloMsg
  | CreateRoomMsg
  | PlayAgainMsg
  | PlayerActionMsg
  | PongMsg
  | LeaveGameMsg
  | VillagersMsg
  | MerchantWindowMsg
  | StartTutorialMsg
  | StartBotMatchMsg
  | TutorialCueMsg;

// ---------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------

export type AssignedMsg = {
  type: "assigned";
  slot: "p1" | "p2";
  playerId: string;
};
export type RoomCreatedMsg = { type: "room_created"; roomCode: string };
export type GameReadyMsg = { type: "game_ready" };
export type OpponentLeftMsg = { type: "opponent_left" };
export type GameStateMsg = {
  type: "game_state";
  state: GameState;
  serverNow: number;
};
export type ErrorMsg = { type: "error"; message: string };
export type PingMsg = { type: "ping" };
export type ToastMsg = { type: "toast"; text: string };
export type CenterToastMsg = { type: "center_toast"; text: string };

export type ServerMessage =
  | AssignedMsg
  | RoomCreatedMsg
  | GameReadyMsg
  | OpponentLeftMsg
  | GameStateMsg
  | ErrorMsg
  | PingMsg
  | ToastMsg
  | CenterToastMsg;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isClientMessage(msg: unknown): msg is ClientMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const t = (msg as { type?: unknown }).type;
  return (
    t === "hello" ||
    t === "create_room" ||
    t === "play_again" ||
    t === "player_action" ||
    t === "pong" ||
    t === "leave_game" ||
    t === "villagers" ||
    t === "merchant_window" ||
    t === "start_tutorial" ||
    t === "start_bot_match" ||
    t === "tutorial_cue"
  );
}

export function isServerMessage(msg: unknown): msg is ServerMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const t = (msg as { type?: unknown }).type;
  return (
    t === "assigned" ||
    t === "room_created" ||
    t === "game_ready" ||
    t === "opponent_left" ||
    t === "game_state" ||
    t === "error" ||
    t === "ping" ||
    t === "toast" ||
    t === "center_toast"
  );
}
