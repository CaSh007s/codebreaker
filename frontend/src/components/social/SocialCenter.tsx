"use client";

import { Bell, Check, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, AccountUser, formatAccountIdentity, formatFriendIdentity, FriendRecord, NotificationRecord } from "@/lib/api";

export function NotificationCenter() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const refresh = async () => {
    try {
      const account = await api.getCurrentAccount();
      if (!account) {
        setSignedIn(false);
        setNotifications([]);
        return;
      }
      setSignedIn(true);
      setNotifications(await api.getNotifications());
    } catch {
      // Guest mode and an unavailable account service should stay silent.
    }
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 5_000);
    const authChanged = () => void refresh();
    const socialChanged = () => void refresh();
    window.addEventListener("codebreaker-auth-changed", authChanged);
    window.addEventListener("codebreaker-social-changed", socialChanged);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("codebreaker-auth-changed", authChanged);
      window.removeEventListener("codebreaker-social-changed", socialChanged);
    };
  }, []);

  const unread = notifications.filter((notification) => !notification.read).length;
  if (!signedIn) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Open notifications"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-full border border-[#3a3a3c] bg-black/30 p-2 text-[#565758] transition-colors hover:border-[#538d4e]/60 hover:text-[#538d4e]"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#cf6679] px-1 text-center font-mono text-[8px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-80 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[#3a3a3c] bg-[#121213] shadow-[0_0_35px_rgba(0,0,0,0.7)]">
          <div className="flex items-center justify-between border-b border-[#3a3a3c] px-4 py-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#538d4e]">INBOX // ALERTS</span>
            <button type="button" aria-label="Close notifications" onClick={() => setOpen(false)} className="text-[#565758] hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center font-mono text-[9px] uppercase text-[#565758]">NO_NEW_TRANSMISSIONS</p>
            ) : notifications.map((notification) => (
              <button
                type="button"
                key={notification.notification_id}
                onClick={() => {
                 if (!notification.read) {
                    void api.markNotificationRead(notification.notification_id);
                    setNotifications((items) => items.map((item) => item.notification_id === notification.notification_id ? { ...item, read: true } : item));
                   }
                   const roomId = notification.payload.room_id;
                   if (roomId) router.push(`/multiplayer/${roomId}?mode=standard&level=${notification.payload.level || "4"}&repeats=${notification.payload.repeats || "false"}&direct=true`);
                   const identity = notification.payload.identity;
                    if (identity && (notification.kind === "friend_request" || notification.kind === "friend_accepted")) {
                      setOpen(false);
                      router.push(`/profile?identity=${encodeURIComponent(identity)}`);
                    }
                    if (notification.kind === "direct_message") {
                      setOpen(false);
                      router.push("/messages");
                    }
                }}
                className={`w-full border-b border-white/5 px-4 py-3 text-left transition-colors hover:bg-white/5 ${notification.read ? "opacity-60" : "bg-[#538d4e]/5"}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notification.read ? "bg-[#565758]" : "bg-[#538d4e] shadow-[0_0_8px_#538d4e]"}`} />
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase text-slate-200">{notification.title}</p>
                    <p className="mt-1 font-mono text-[9px] uppercase leading-relaxed text-[#565758]">{notification.body}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function FriendsCenter({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [blocked, setBlocked] = useState<FriendRecord[]>([]);
  const [targetName, setTargetName] = useState("");
  const [targetDiscriminator, setTargetDiscriminator] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const current = await api.getCurrentAccount();
      setAccount(current?.user ?? null);
      if (current) {
        const [friendList, blockedList] = await Promise.all([api.getFriends(), api.getBlockedUsers().catch(() => [])]);
        setFriends(friendList);
        setBlocked(blockedList);
      } else {
        setFriends([]);
        setBlocked([]);
      }
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => void refresh());
    const timer = window.setInterval(() => void refresh(), 5_000);
    const socialChanged = () => void refresh();
    window.addEventListener("codebreaker-social-changed", socialChanged);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("codebreaker-social-changed", socialChanged);
    };
  }, []);

  const incoming = useMemo(() => friends.filter((friend) => friend.status === "pending" && friend.direction === "incoming"), [friends]);
  const accepted = useMemo(() => friends.filter((friend) => friend.status === "accepted"), [friends]);

  const searchProfile = () => {
    if (!targetName.trim() || !/^\d{4}$/.test(targetDiscriminator)) {
      setError("ENTER_CALLSIGN_AND_FOUR_DIGIT_DISCRIMINATOR");
      return;
    }
    router.push(`/profile?identity=${encodeURIComponent(`${targetName.trim()}#${targetDiscriminator}`)}`);
    onClose();
  };

  const startDirectGame = async (friend: FriendRecord) => {
    setBusy(true);
    setError(null);
    try {
      const roomId = crypto.randomUUID().slice(0, 8);
      await api.challengeFriend(friend.user_id, roomId);
      router.push(`/multiplayer/${roomId}?mode=standard&level=4&repeats=false&direct=true`);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const respond = async (userId: string, action: "accept" | "decline") => {
    setError(null);
    try {
      await api.respondToFriendRequest(userId, action);
      await refresh();
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const remove = async (friend: FriendRecord) => {
    try {
      await api.removeFriend(friend.user_id);
      await refresh();
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const block = async (friend: FriendRecord) => {
    try {
      await api.blockUser(friend.user_id);
      await refresh();
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const unblock = async (friend: FriendRecord) => {
    try {
      await api.unblockUser(friend.user_id);
      await refresh();
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const enablePush = async () => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setError("PUSH_ALERTS_REQUIRE_A_VAPID_PUBLIC_KEY");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setError("PUSH_PERMISSION_WAS_NOT_GRANTED");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
    await api.savePushSubscription(subscription);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-100 overflow-y-auto bg-black/80 p-3 pb-24 backdrop-blur-md sm:p-6 sm:pb-6">
      <div className="flex min-h-full items-center justify-center py-3 sm:py-2">
      <div className="max-h-[calc(100dvh-6rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#465844] bg-[#121813] p-5 shadow-[0_0_50px_rgba(0,0,0,0.8)] sm:max-h-[calc(100dvh-3rem)] sm:p-8 lg:p-10" onClick={(event) => event.stopPropagation()}>
        <div className="mb-7 flex items-start justify-between gap-5">
          <div><p className="font-mono text-sm font-bold tracking-[0.2em] text-[#9bdb68] sm:text-base">SOCIAL // FRIENDS</p><p className="mt-2 font-mono text-[10px] uppercase leading-relaxed text-[#7b8b76] sm:text-[11px]">Invite trusted operatives and receive live alerts.</p></div>
          <button type="button" aria-label="Close friends" onClick={onClose} className="text-[#565758] hover:text-white"><X className="h-4 w-4" /></button>
        </div>
         {!account ? <p className="rounded-lg border border-[#cf6679]/30 bg-[#cf6679]/5 p-3 font-mono text-[9px] uppercase text-[#cf6679]">SIGN_IN_REQUIRED_FOR_SOCIAL_FEATURES</p> : (
           <>
              <p className="mb-6 rounded-xl border border-[#789b6a]/50 bg-[#789b6a]/12 p-4 font-mono text-[10px] font-bold uppercase tracking-widest text-[#d9edc0] shadow-[inset_0_0_24px_rgba(125,181,97,0.06)] sm:text-xs">YOUR_HANDLE // <span className="text-[#b8f28a]">{formatAccountIdentity(account)}</span></p>
              <div className="mb-7">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-[#7b8b76] sm:text-[11px]">SEARCH_PROFILE // SEND_REQUEST_FROM_PROFILE</p>
                <div className="flex gap-2">
                  <input value={targetName} onChange={(event) => setTargetName(event.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} onKeyDown={(event) => { if (event.key === "Enter") searchProfile(); }} placeholder="CALLSIGN" className="min-w-0 flex-1 rounded-lg border border-[#3a3a3c] bg-black/35 px-3 py-3.5 font-mono text-xs uppercase text-slate-100 outline-none transition-colors focus:border-[#53694d] focus:bg-black/60 sm:text-sm" />
                  <span className="flex items-center font-mono text-[#7f9079]">#</span>
                  <input value={targetDiscriminator} maxLength={4} inputMode="numeric" onChange={(event) => setTargetDiscriminator(event.target.value.replace(/\D/g, ""))} onKeyDown={(event) => { if (event.key === "Enter") searchProfile(); }} placeholder="1234" className="w-20 rounded-lg border border-[#3a3a3c] bg-black/35 px-2 py-3.5 font-mono text-xs text-slate-100 outline-none transition-colors focus:border-[#53694d] focus:bg-black/60 sm:text-sm" />
                  <button type="button" onClick={searchProfile} aria-label="Search profile" className="rounded-lg bg-[#79a968] px-4 text-black transition-colors hover:bg-[#9bdb68]"><Search className="h-5 w-5" /></button>
                </div>
             </div>
              {incoming.length > 0 && <section className="mb-7"><p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-[#c8b653] sm:text-[11px]">INCOMING_REQUESTS</p>{incoming.map((friend) => <div key={friend.user_id} className="mb-3 flex items-center justify-between rounded-lg border border-[#c8b653]/20 bg-[#c8b653]/5 p-4"><span className="font-mono text-xs font-bold text-slate-200 sm:text-sm">{formatFriendIdentity(friend)}</span><div className="flex gap-2"><button type="button" onClick={() => void respond(friend.user_id, "accept")} aria-label={`Accept ${formatFriendIdentity(friend)}`} className="rounded bg-[#538d4e] p-2 text-black"><Check className="h-4 w-4" /></button><button type="button" onClick={() => void respond(friend.user_id, "decline")} aria-label={`Decline ${formatFriendIdentity(friend)}`} className="rounded bg-[#cf6679] p-2 text-white"><X className="h-4 w-4" /></button></div></div>)}</section>}
              <section><p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-[#7b8b76] sm:text-[11px]">FRIEND_LIST // {accepted.length}</p>{accepted.length === 0 ? <p className="rounded-lg border border-white/5 p-5 text-center font-mono text-[10px] uppercase text-[#687468] sm:text-[11px]">NO_FRIENDS_CONNECTED</p> : accepted.map((friend) => <div key={friend.user_id} className="mb-3 rounded-lg border border-white/5 bg-white/[0.02] p-4"><div className="flex items-center justify-between gap-3"><span className="font-mono text-xs font-bold text-slate-200 sm:text-sm">{formatFriendIdentity(friend)}</span><button type="button" disabled={busy} onClick={() => void startDirectGame(friend)} className="font-mono text-[9px] uppercase text-[#9bdb68] hover:text-[#c9e99a] disabled:opacity-50 sm:text-[10px]">START_DIRECT_GAME</button></div><div className="mt-3 flex justify-end gap-4"><button type="button" onClick={() => void remove(friend)} className="font-mono text-[9px] uppercase text-[#778777] hover:text-[#cf6679] sm:text-[10px]">REMOVE</button><button type="button" onClick={() => void block(friend)} className="font-mono text-[9px] uppercase text-[#778777] hover:text-red-400 sm:text-[10px]">BLOCK</button></div></div>)}</section>
              {blocked.length > 0 && <section className="mt-7"><p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-[#cf8896] sm:text-[11px]">BLOCK_LIST // {blocked.length}</p>{blocked.map((friend) => <div key={friend.user_id} className="mb-3 flex items-center justify-between rounded-lg border border-[#cf6679]/20 bg-[#cf6679]/5 p-4"><span className="font-mono text-xs font-bold text-slate-200 sm:text-sm">{formatFriendIdentity(friend)}</span><button type="button" onClick={() => void unblock(friend)} className="font-mono text-[9px] uppercase text-[#c9e99a] hover:text-white sm:text-[10px]">UNBLOCK</button></div>)}</section>}
             <button type="button" onClick={() => void enablePush()} className="mt-7 w-full rounded-lg border border-[#538d4e]/30 bg-[#538d4e]/5 py-3.5 font-mono text-[10px] uppercase tracking-widest text-[#9bdb68] hover:bg-[#538d4e]/10 sm:text-[11px]">ENABLE_PUSH_ALERTS</button>
           </>
         )}
         {error && <p role="alert" className="mt-4 font-mono text-[9px] uppercase text-red-400">{error}</p>}
      </div>
      </div>
    </div>
  );
}

function decodeKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
