"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000";

export const useSocket = (room?: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<Record<string, unknown> | null>(null);
  const [lastRoomData, setLastRoomData] = useState<Record<string, unknown> | null>(null);
  const [lastError, setLastError] = useState<Record<string, unknown> | null>(null);

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
      if (room) {
        socket.emit("join_room", { room });
      }
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

    socket.on("room_update", (data) => {
      requestAnimationFrame(() => {
        setLastRoomData(data);
      });
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
        socket.emit("leave_room", { room });
      }
      socket.disconnect();
    };
  }, [room]);

  const sendMessage = (message: string | Record<string, unknown>) => {
    if (socket && room) {
      socket.emit("chat_message", { room, message });
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
    emitEvent,
  };
};
