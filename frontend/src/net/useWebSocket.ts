import { useEffect, useRef, useCallback } from "react";
import type { ServerMessage, ClientMessage } from "@gamedesign/shared";
import { useConnectionStore } from "../state/connectionStore";
import { useGameStore } from "../state/gameStore";

const WS_URL = "ws://localhost:3001";
const RECONNECT_DELAY_MS = 3_000;

function getOrCreatePlayerId(): string {
  const stored = localStorage.getItem("playerId");
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem("playerId", id);
  return id;
}

function getRoomCodeFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("room");
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const { setStatus, setError, setSend, setSlot, setPlayerId, setRoomCode, reset } =
    useConnectionStore.getState();
  const { setGame } = useGameStore.getState();

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case "room_created":
          setRoomCode(msg.roomCode);
          localStorage.setItem("roomCode", msg.roomCode);
          break;
        case "assigned":
          setSlot(msg.slot);
          setPlayerId(msg.playerId);
          setStatus("waiting");
          break;
        case "game_ready":
          setStatus("in_game");
          break;
        case "opponent_left":
          setStatus("waiting");
          break;
        case "game_state":
          setGame(msg.state);
          if (msg.state.phase === "playing" || msg.state.phase === "ended") setStatus("in_game");
          break;
        case "error":
          setError(msg.message);
          break;
        case "ping":
          send({ type: "pong" });
          break;
      }
    },
    [send, setGame, setSlot, setError, setStatus, setPlayerId, setRoomCode],
  );

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const playerId = getOrCreatePlayerId();
    const ws = new WebSocket(`${WS_URL}?playerId=${playerId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      const playerId = getOrCreatePlayerId();
      setPlayerId(playerId);
      setError(null);

      const urlRoom = getRoomCodeFromUrl();
      const storedRoom = localStorage.getItem("roomCode");

      if (urlRoom) {
        // Joining via invite link — store and send hello
        localStorage.setItem("roomCode", urlRoom);
        setRoomCode(urlRoom);
        send({ type: "hello", playerId, roomCode: urlRoom });
      } else if (storedRoom) {
        // Reconnecting to an existing room
        setRoomCode(storedRoom);
        send({ type: "hello", playerId, roomCode: storedRoom });
      } else {
        // No room — show the lobby so the user can create or join
        setStatus("lobby");
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        handleMessage(msg);
      } catch {
        console.error("[ws] Failed to parse message");
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      reset();
      reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = () => {
      setError("Connection error");
    };
  }, [handleMessage, reset, setError, setStatus, setPlayerId, setRoomCode, send]);

  useEffect(() => {
    mountedRef.current = true;
    setSend(send);
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect, send, setSend]);
}
