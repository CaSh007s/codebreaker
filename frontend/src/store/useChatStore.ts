"use client";

import { create } from "zustand";

export interface ChatMessage {
  sender_id: string;
  sender_username: string;
  text: string;
  timestamp: string;
  type: "chat" | "emoji" | "system";
}

interface ChatStore {
  messages: ChatMessage[];
  unreadCount: number;
  isOpen: boolean;

  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  clearSystemMessages: () => void;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
}

export const useChatStore = create<ChatStore>()((set, get) => ({
  messages: [],
  unreadCount: 0,
  isOpen: false,

  addMessage: (msg) => {
    set((state) => ({
      messages: [...state.messages, msg],
      unreadCount: state.isOpen ? 0 : state.unreadCount + 1,
    }));
  },

  clearMessages: () => set({ messages: [], unreadCount: 0 }),
  
  clearSystemMessages: () => set((state) => ({
    messages: state.messages.filter(m => m.type !== "system"),
    unreadCount: 0,
  })),

  setOpen: (open) =>
    set({
      isOpen: open,
      unreadCount: open ? 0 : get().unreadCount,
    }),

  toggleOpen: () => {
    const next = !get().isOpen;
    set({
      isOpen: next,
      unreadCount: next ? 0 : get().unreadCount,
    });
  },
}));
