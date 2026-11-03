"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, formatFriendIdentity, FriendRecord, ProfileResponse } from "@/lib/api";
import DirectMessagesPanel from "@/components/social/DirectMessagesPanel";

export default function MessagesPage() {
  const router = useRouter();
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [selected, setSelected] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.getCurrentAccount().then((account) => {
      if (!account) {
        router.replace("/");
        return;
      }
      return api.getFriends().then(setFriends);
    }).catch((requestError) => setError((requestError as Error).message));
  }, [router]);

  const openConversation = async (friend: FriendRecord) => {
    try {
      setSelected(await api.getProfile(formatFriendIdentity(friend)));
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const accepted = friends.filter((friend) => friend.status === "accepted");
  return <main className="min-h-dvh bg-[#080a08] px-5 pb-12 pt-24 text-slate-100 sm:px-10"><section className="mx-auto max-w-3xl rounded-2xl border border-[#354332] bg-[#111510]/90 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] sm:p-8"><p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#7f9b76]">Social // secure channels</p><h1 className="mt-2 font-serif text-3xl font-bold text-[#edf3e9]">Messages</h1><p className="mt-2 font-mono text-[9px] uppercase text-[#687468]">Select a connected friend to open a live Socket.IO channel.</p><div className="mt-8 space-y-2">{accepted.length === 0 ? <p className="rounded-xl border border-white/5 p-8 text-center font-mono text-[10px] uppercase tracking-widest text-[#687468]">NO_FRIENDS_CONNECTED</p> : accepted.map((friend) => <button type="button" key={friend.user_id} onClick={() => void openConversation(friend)} className="flex w-full items-center justify-between rounded-xl border border-[#354332] bg-white/[0.02] px-4 py-4 text-left transition-colors hover:border-[#86a977] hover:bg-[#6a8c5c]/10"><span><span className="block font-sans font-semibold text-[#e6eee0]">{friend.username}</span><span className="mt-1 block font-mono text-[10px] text-[#7f9079]">#{friend.discriminator}</span></span><span className="font-mono text-[9px] uppercase text-[#9bdb68]">Open channel →</span></button>)}</div>{error && <p role="alert" className="mt-5 font-mono text-[9px] uppercase text-[#cf8896]">{error}</p>}</section>{selected && <DirectMessagesPanel profile={selected} onClose={() => setSelected(null)} />}</main>;
}
