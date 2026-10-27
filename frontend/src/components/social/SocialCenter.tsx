"use client";

import { Bell, Check, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, AccountUser, FriendRecord, NotificationRecord } from "@/lib/api";

export function NotificationCenter() {
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
    const timer = window.setInterval(() => void refresh(), 30_000);
    const authChanged = () => void refresh();
    window.addEventListener("codebreaker-auth-changed", authChanged);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("codebreaker-auth-changed", authChanged);
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
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const current = await api.getCurrentAccount();
      setAccount(current?.user ?? null);
      if (current) setFriends(await api.getFriends());
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => void refresh());
    return () => cancelAnimationFrame(frame);
  }, []);

  const incoming = useMemo(() => friends.filter((friend) => friend.status === "pending" && friend.direction === "incoming"), [friends]);
  const accepted = useMemo(() => friends.filter((friend) => friend.status === "accepted"), [friends]);

  const sendRequest = async () => {
    if (!target.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.sendFriendRequest(target.trim());
      setTarget("");
      await refresh();
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
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[#3a3a3c] bg-[#121213] p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)]" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div><p className="font-mono text-xs font-bold tracking-widest text-[#538d4e]">SOCIAL // FRIENDS</p><p className="mt-2 font-mono text-[9px] uppercase text-[#565758]">Invite trusted operatives and receive live alerts.</p></div>
          <button type="button" aria-label="Close friends" onClick={onClose} className="text-[#565758] hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        {!account ? <p className="rounded-lg border border-[#cf6679]/30 bg-[#cf6679]/5 p-3 font-mono text-[9px] uppercase text-[#cf6679]">SIGN_IN_REQUIRED_FOR_SOCIAL_FEATURES</p> : (
          <>
            <div className="mb-5 flex gap-2">
              <input value={target} onChange={(event) => setTarget(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void sendRequest(); }} placeholder="OPERATIVE_CALLSIGN" className="min-w-0 flex-1 rounded-lg border border-[#3a3a3c] bg-black/30 px-3 py-3 font-mono text-[10px] uppercase text-slate-100 outline-none focus:border-[#538d4e]" />
              <button type="button" disabled={busy} onClick={() => void sendRequest()} aria-label="Send friend request" className="rounded-lg bg-[#538d4e] px-3 text-black transition-colors hover:bg-[#58a352] disabled:opacity-50"><UserPlus className="h-4 w-4" /></button>
            </div>
            {incoming.length > 0 && <section className="mb-5"><p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-[#c8b653]">INCOMING_REQUESTS</p>{incoming.map((friend) => <div key={friend.user_id} className="mb-2 flex items-center justify-between rounded-lg border border-[#c8b653]/20 bg-[#c8b653]/5 p-3"><span className="font-mono text-[10px] font-bold text-slate-200">{friend.username}</span><div className="flex gap-2"><button type="button" onClick={() => void respond(friend.user_id, "accept")} aria-label={`Accept ${friend.username}`} className="rounded bg-[#538d4e] p-1 text-black"><Check className="h-3 w-3" /></button><button type="button" onClick={() => void respond(friend.user_id, "decline")} aria-label={`Decline ${friend.username}`} className="rounded bg-[#cf6679] p-1 text-white"><X className="h-3 w-3" /></button></div></div>)}</section>}
            <section><p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-[#565758]">FRIEND_LIST // {accepted.length}</p>{accepted.length === 0 ? <p className="rounded-lg border border-white/5 p-4 text-center font-mono text-[9px] uppercase text-[#565758]">NO_FRIENDS_CONNECTED</p> : accepted.map((friend) => <div key={friend.user_id} className="mb-2 flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3"><span className="font-mono text-[10px] font-bold text-slate-200">{friend.username}</span><div className="flex gap-3"><button type="button" onClick={() => void remove(friend)} className="font-mono text-[8px] uppercase text-[#565758] hover:text-[#cf6679]">REMOVE</button><button type="button" onClick={() => void block(friend)} className="font-mono text-[8px] uppercase text-[#565758] hover:text-red-400">BLOCK</button></div></div>)}</section>
            <button type="button" onClick={() => void enablePush()} className="mt-5 w-full rounded-lg border border-[#538d4e]/30 bg-[#538d4e]/5 py-3 font-mono text-[9px] uppercase tracking-widest text-[#538d4e] hover:bg-[#538d4e]/10">ENABLE_PUSH_ALERTS</button>
          </>
        )}
        {error && <p role="alert" className="mt-4 font-mono text-[9px] uppercase text-red-400">{error}</p>}
      </div>
    </div>
  );
}

function decodeKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
