"use client";

import { useCallback, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useChatStore, ChatMessage } from "@/store/useChatStore";
import { API_BASE_URL } from "@/lib/api";

const SOCKET_URL = (process.env.NEXT_PUBLIC_SOCKET_URL || API_BASE_URL).replace(/\/$/, "");
type Hint = { position: number; digit: string };

export const useSocket = (room?: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastRoomData, setLastRoomData] = useState<Record<string, unknown> | null>(null);
  const [lastError, setLastError] = useState<{ message: string } | null>(null);
  const [hintsRevealed, setHintsRevealed] = useState<Hint[]>([]);

  useEffect(() => {
    useChatStore.getState().clearMessages();
    const connection = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      tryAllTransports: true,
      autoConnect: false,
    });
    let revision = -1;
    let startedAt: unknown;
    const receiveRoom = (data: Record<string, unknown>) => {
      if (data.room_id !== room || Number(data.revision) < revision) return;
      revision = Number(data.revision);
      if (data.started_at !== startedAt) {
        startedAt = data.started_at;
        setHintsRevealed([]);
      }
      setLastRoomData(data);
    };
    connection.on("connect", () => {
      setSocket(connection);
      setIsConnected(true);
      setLastError(null);
    });
    connection.on("disconnect", () => setIsConnected(false));
    connection.on("connect_error", () => {
      setIsConnected(false);
      setLastError({ message: "Connection unavailable. Retrying…" });
    });
    connection.on("room_update", receiveRoom);
    connection.on("game_start", (data) => {
      receiveRoom(data);
      useChatStore.getState().clearSystemMessages();
    });
    connection.on("game_over", receiveRoom);
    connection.on("hint_history", setHintsRevealed);
    connection.on("hint_received", (hint: Hint) => {
      setHintsRevealed((previous) => [...previous.filter(h => h.position !== hint.position), hint]);
    });
    connection.on("chat_message", (data: ChatMessage) => useChatStore.getState().addMessage(data));
    connection.on("error", (error) => {
      setLastError({ message: typeof error === "string" ? error : error.message || error.error || "AN_ERROR_OCCURRED" });
    });
    connection.connect();
    const heartbeat = setInterval(() => {
      if (connection.connected) connection.emit("room_heartbeat", { room_id: room });
    }, 60_000);
    return () => {
      clearInterval(heartbeat);
      connection.removeAllListeners();
      connection.disconnect();
    };
  }, [room]);

  const emitEvent = useCallback((event: string, data: unknown) => {
    if (!socket?.connected) {
      setLastError({ message: "Connection unavailable. Please wait for reconnection." });
      return false;
    }
    socket.emit(event, data);
    return true;
  }, [socket]);

  const sendMessage = useCallback((data: { text: string; sender_id: string; sender_username: string }) => {
    emitEvent("chat_message", { room_id: room, ...data });
  }, [emitEvent, room]);
  const sendEmoji = useCallback((data: { emoji: string; sender_id: string; sender_username: string }) => {
    emitEvent("send_emoji", { room_id: room, ...data });
  }, [emitEvent, room]);

  return { socket, isConnected, lastRoomData, lastError, hintsRevealed, emitEvent, sendMessage, sendEmoji };
};
