"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ProfileResponse } from "@/lib/api";
import { useDirectSocket } from "@/hooks/useDirectSocket";

export default function DirectMessagesPanel({ profile, onClose }: { profile: ProfileResponse; onClose: () => void }) {
  const [messages, setMessages] = useState<Awaited<ReturnType<typeof api.getDirectMessages>>>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const { isConnected, lastMessage, sendMessage } = useDirectSocket(profile.user_id);

  const refresh = useCallback(async () => {
    try {
      setMessages(await api.getDirectMessages(profile.user_id));
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }, [profile.user_id]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!lastMessage || (lastMessage.sender_id !== profile.user_id && lastMessage.recipient_id !== profile.user_id)) return;
    setMessages((current) => current.some((message) => message.message_id === lastMessage.message_id) ? current : [...current, lastMessage]);
  }, [lastMessage, profile.user_id]);

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      let message;
      const useRealtime = isConnected;
      try {
        message = useRealtime ? await sendMessage(draft) : await api.sendDirectMessage(profile.user_id, draft);
      } catch (socketError) {
        if (useRealtime) throw socketError;
        message = await api.sendDirectMessage(profile.user_id, draft);
      }
      setMessages((current) => current.some((item) => item.message_id === message.message_id) ? current : [...current, message]);
      setDraft("");
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={`Messages with ${profile.username}`} className="flex h-[min(620px,90dvh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#56664e] bg-[#121812] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#354332] px-5 py-4"><div><p className="font-mono text-[9px] uppercase tracking-widest text-[#82937a]">DIRECT_CHANNEL {isConnected && <span className="text-[#9bdb68]">LIVE</span>}</p><p className="mt-1 font-sans text-lg font-semibold text-[#ecf2e7]">{profile.username}<span className="ml-2 font-mono text-sm text-[#82937a]">#{profile.discriminator}</span></p></div><button type="button" aria-label="Close direct messages" onClick={onClose} className="rounded-lg p-2 text-[#82937a] hover:bg-white/5 hover:text-white"><span className="text-xl">×</span></button></header>
        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">{messages.length === 0 ? <p className="py-16 text-center font-mono text-[9px] uppercase tracking-widest text-[#687468]">NO_TRANSMISSIONS_YET</p> : messages.map((message) => <div key={message.message_id} className={`flex ${message.sender_id === profile.user_id ? "justify-start" : "justify-end"}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 font-sans text-sm ${message.sender_id === profile.user_id ? "rounded-tl-none bg-[#253125] text-[#d9e3d3]" : "rounded-tr-none bg-[#b9dc83] text-[#172112]"}`}><p>{message.body}</p><time className="mt-2 block font-mono text-[8px] opacity-50">{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div></div>)}</div>
        <footer className="border-t border-[#354332] p-4"><div className="flex gap-2 rounded-xl border border-[#465640] bg-black/20 p-2 focus-within:border-[#9bc575]"><input autoFocus value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Write a secure message..." aria-label="Direct message" className="min-w-0 flex-1 bg-transparent px-2 font-sans text-sm outline-none placeholder:text-[#687468]" /><button type="button" disabled={sending || !draft.trim()} onClick={() => void send()} className="rounded-lg bg-[#b9dc83] px-4 py-2 font-mono text-[9px] font-bold uppercase text-[#172112] disabled:opacity-40">SEND</button></div>{error && <p role="alert" className="mt-2 font-mono text-[9px] uppercase text-[#cf8896]">{error}</p>}</footer>
      </section>
    </div>
  );
}
