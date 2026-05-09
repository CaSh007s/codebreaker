"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChatStore } from "@/store/useChatStore";
import { X, Send } from "lucide-react";

interface ChatPanelProps {
  player_id: string;
  username: string;
  onSendMessage: (data: { text: string; sender_id: string; sender_username: string }) => void;
  onSendEmoji: (data: { emoji: string; sender_id: string; sender_username: string }) => void;
}

const VALID_EMOJIS = ["🎯", "💀", "🔥", "👀", "🤯"];

export default function ChatPanel({
  player_id,
  username,
  onSendMessage,
  onSendEmoji,
}: ChatPanelProps) {
  const { messages, isOpen, setOpen } = useChatStore();
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage({
      text: inputText,
      sender_id: player_id,
      sender_username: username,
    });
    setInputText("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSend();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop for Mobile overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-200 lg:hidden"
          />

          {/* Chat Container */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-sm bg-[#0a0a0b] border-l border-[#3a3a3c] shadow-2xl z-201 flex flex-col pt-safe"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#3a3a3c] bg-white/5">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#538d4e] animate-pulse" />
                <h3 className="font-serif font-bold tracking-widest text-[#538d4e] uppercase text-sm">
                  SECURE_COMMS
                </h3>
              </div>
              <button
                onClick={(e) => {
                  e.currentTarget.blur();
                  setOpen(false);
                }}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors text-[#565758] hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar scroll-smooth"
            >
              {messages.map((msg, idx) => {
                const isSystem = msg.type === "system";
                const isMe = msg.sender_id === player_id;

                if (isSystem) {
                  return (
                    <div key={idx} className="flex flex-col items-center py-2 px-4">
                      <div className="w-full text-center border border-yellow-500/20 bg-yellow-500/5 py-1 px-4 rounded font-mono text-[9px] text-yellow-500 uppercase tracking-widest shadow-[0_0_15px_rgba(234,179,8,0.1)]">
                        {`>> [SYSTEM]: ${msg.text}`}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={idx}
                    className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                  >
                    {!isMe && (
                      <span className="text-[9px] font-mono text-[#565758] uppercase ml-1 mb-1">
                        {msg.sender_username}
                      </span>
                    )}
                    <div
                      className={`max-w-[85%] px-4 py-2 rounded-2xl text-sm font-sans wrap-break-word ${
                        isMe
                          ? "bg-[#538d4e] text-black rounded-tr-none shadow-[0_0_20px_rgba(83,141,78,0.2)]"
                          : "bg-[#3a3a3c] text-slate-100 rounded-tl-none shadow-xl"
                      }`}
                    >
                      {msg.text}
                    </div>
                    <span className="text-[8px] font-mono text-[#3a3a3c] mt-1 px-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Input Bar */}
            <div className="p-4 bg-white/2 border-t border-[#3a3a3c]">
              {/* Emoji bar */}
              <div className="flex gap-2 mb-3 justify-center">
                {VALID_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onSendEmoji({
                        emoji,
                        sender_id: player_id,
                        sender_username: username,
                      });
                    }}
                    className="p-2 hover:bg-white/10 rounded-lg transition-all hover:scale-110 active:scale-90"
                  >
                    <span className="text-lg">{emoji}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 bg-black/40 border border-[#3a3a3c] rounded-xl p-2 focus-within:border-[#538d4e] transition-colors">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Transmit message..."
                  className="flex-1 bg-transparent outline-none text-sm px-2 font-mono placeholder:opacity-30"
                />
                <button
                  onClick={(e) => {
                    e.currentTarget.blur();
                    handleSend();
                  }}
                  disabled={!inputText.trim()}
                  className="p-2 bg-[#538d4e] text-black rounded-lg hover:bg-[#58a352] disabled:opacity-30 disabled:scale-100 transition-all active:scale-95"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
