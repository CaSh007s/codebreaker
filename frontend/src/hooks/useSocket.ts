"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useChatStore, ChatMessage } from "@/store/useChatStore";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000";

export const useSocket = (room?: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<Record<string, unknown> | null>(null);
  const [lastRoomData, setLastRoomData] = useState<Record<string, unknown> | null>(null);
  const [lastError, setLastError] = useState<Record<string, unknown> | null>(null);
  
  const addChatMessage = useChatStore((state) => state.addMessage);
  const clearSystemMessages = useChatStore((state) => state.clearSystemMessages);

  useEffect(() => {
    // Initialize socket connection
    const socket = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket"],
      autoConnect: true,
    });

    requestAnimationFrame(() => {
      setSocket(socket);
    });

    socket.on("connect", () => {
      setIsConnected(true);
      console.log("Connected to socket server");
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      console.log("Disconnected from socket server");
    });

    socket.on("message", (data) => {
      requestAnimationFrame(() => {
        setLastMessage(data);
      });
    });

    socket.on("chat_message", (data: ChatMessage) => {
      addChatMessage(data);
    });

    socket.on("room_update", (data) => {
      requestAnimationFrame(() => {
        setLastRoomData(data);
      });
    });

    socket.on("game_start", (data) => {
      console.log("Game started!", data);
      clearSystemMessages();
    });

    socket.on("game_over", (data) => {
      console.log("Game over!", data);
    });

    socket.on("status", (data) => {
      console.log("Status update:", data);
    });

    socket.on("error", (err) => {
      console.error("Socket error:", err);
      requestAnimationFrame(() => {
        setLastError(err);
      });
    });

    return () => {
      if (room) {
        socket.emit("leave_room", { room_id: room });
      }
      socket.disconnect();
    };
  }, [room, addChatMessage, clearSystemMessages]);

  const sendMessage = (data: { text: string; sender_id: string; sender_username: string }) => {
    if (socket && room) {
      socket.emit("chat_message", { room_id: room, ...data });
    }
  };
  
  const sendEmoji = (data: { emoji: string; sender_id: string; sender_username: string }) => {
    if (socket && room) {
      socket.emit("send_emoji", { room_id: room, ...data });
    }
  };

  const emitEvent = (event: string, data: unknown) => {
    if (socket) {
      socket.emit(event, data);
    }
  };

  return {
    socket,
    isConnected,
    lastMessage,
    lastRoomData,
    lastError,
    sendMessage,
    sendEmoji,
    emitEvent,
  };
};
