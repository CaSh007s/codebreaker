"use client";

import { useCallback, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { API_BASE_URL, DirectMessageRecord } from "@/lib/api";

const SOCKET_URL = (process.env.NEXT_PUBLIC_SOCKET_URL || API_BASE_URL).replace(/\/$/, "");

export type RealtimeDirectMessage = DirectMessageRecord & { recipient_id: string };

export function useDirectSocket(otherUserId: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<RealtimeDirectMessage | null>(null);

  useEffect(() => {
    if (!otherUserId) return;
    const connection = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      tryAllTransports: true,
      withCredentials: true,
      autoConnect: false,
    });

    connection.on("connect", () => {
      setSocket(connection);
      setIsConnected(true);
    });
    connection.on("disconnect", () => setIsConnected(false));
    connection.on("direct_message", (message: RealtimeDirectMessage) => setLastMessage(message));
    connection.connect();

    return () => {
      connection.removeAllListeners();
      connection.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [otherUserId]);

  const sendMessage = useCallback((body: string) => {
    if (!socket?.connected) return Promise.reject(new Error("DIRECT_CHANNEL_UNAVAILABLE"));
    return new Promise<DirectMessageRecord>((resolve, reject) => {
      socket.timeout(10_000).emit("direct_message", { other_user_id: otherUserId, body }, (error: Error | null, response: { ok?: boolean; message?: DirectMessageRecord; error?: string }) => {
        if (error) {
          reject(new Error("DIRECT_CHANNEL_UNAVAILABLE"));
          return;
        }
        if (!response?.ok || !response.message) {
          reject(new Error(response?.error || "DIRECT_MESSAGE_FAILED"));
          return;
        }
        resolve(response.message);
      });
    });
  }, [otherUserId, socket]);

  return { isConnected, lastMessage, sendMessage };
}
