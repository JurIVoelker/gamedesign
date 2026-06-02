import { create } from "zustand";
import type { ClientMessage } from "@gamedesign/shared";

export type AppStatus =
  | "disconnected"
  | "connecting"
  | "lobby"
  | "waiting"
  | "in_game";

interface ConnectionState {
  status: AppStatus;
  playerId: string | null;
  slot: "p1" | "p2" | null;
  roomCode: string | null;
  error: string | null;
  send: ((msg: ClientMessage) => void) | null;
  disconnect: (() => void) | null;

  setStatus: (status: AppStatus) => void;
  setSlot: (slot: "p1" | "p2") => void;
  setPlayerId: (id: string) => void;
  setRoomCode: (code: string | null) => void;
  setError: (error: string | null) => void;
  setSend: (fn: (msg: ClientMessage) => void) => void;
  setDisconnect: (fn: () => void) => void;
  reset: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: "disconnected",
  playerId: null,
  slot: null,
  roomCode: null,
  error: null,
  send: null,
  disconnect: null,

  setStatus: (status) => set({ status }),
  setSlot: (slot) => set({ slot }),
  setPlayerId: (id) => set({ playerId: id }),
  setRoomCode: (code) => set({ roomCode: code }),
  setError: (error) => set({ error }),
  setSend: (fn) => set({ send: fn }),
  setDisconnect: (fn) => set({ disconnect: fn }),
  reset: () =>
    set({
      status: "disconnected",
      slot: null,
      roomCode: null,
      error: null,
    }),
}));
