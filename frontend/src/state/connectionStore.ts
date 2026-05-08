import { create } from "zustand";
import type { ClientMessage } from "@gamedesign/shared";

export type AppStatus = "disconnected" | "connecting" | "waiting" | "in_game";

interface ConnectionState {
  status: AppStatus;
  playerId: string | null;
  slot: "p1" | "p2" | null;
  error: string | null;
  send: ((msg: ClientMessage) => void) | null;

  setStatus: (status: AppStatus) => void;
  setSlot: (slot: "p1" | "p2") => void;
  setPlayerId: (id: string) => void;
  setError: (error: string | null) => void;
  setSend: (fn: (msg: ClientMessage) => void) => void;
  reset: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: "disconnected",
  playerId: null,
  slot: null,
  error: null,
  send: null,

  setStatus: (status) => set({ status }),
  setSlot: (slot) => set({ slot }),
  setPlayerId: (id) => set({ playerId: id }),
  setError: (error) => set({ error }),
  setSend: (fn) => set({ send: fn }),
  reset: () =>
    set({
      status: "disconnected",
      slot: null,
      error: null,
    }),
}));
