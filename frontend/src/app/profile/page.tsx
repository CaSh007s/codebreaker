"use client";
/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  CalendarDays,
  Camera,
  Check,
  Flag,
  Flame,
  Info,
  MessageCircle,
  MoreHorizontal,
  Swords,
  Target,
  Trophy,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, AccountUser, formatAccountIdentity, formatFriendIdentity, FriendRecord, ProfileResponse } from "@/lib/api";
import { avatarUrl, nextAvatar } from "@/lib/avatar";
import DirectMessagesPanel from "@/components/social/DirectMessagesPanel";

type ProfileTab = "records" | "friends" | "about";

export default function ProfilePage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ProfileRoute />
    </Suspense>
  );
}

function ProfileRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedIdentity = searchParams.get("identity");

  return <ProfileContent requestedIdentity={requestedIdentity} onBack={() => router.push("/play")} />;
}

function ProfileContent({ requestedIdentity, onBack }: { requestedIdentity: string | null; onBack: () => void }) {
  const router = useRouter();
  const profileCardRef = useRef<HTMLElement>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [viewer, setViewer] = useState<AccountUser | null>(null);
  const [friends, setFriends] = useState<FriendRecord[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<FriendRecord[]>([]);
  const [tab, setTab] = useState<ProfileTab>("records");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadProfile = useCallback(async (identity?: string | null, silent = false) => {
    if (!silent) setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let current: Awaited<ReturnType<typeof api.getCurrentAccount>> = null;
      try {
        current = await api.getCurrentAccount();
      } catch (accountError) {
        if (!identity) throw accountError;
      }
      setViewer(current?.user ?? null);
      const profileIdentity = identity || (current ? formatAccountIdentity(current.user) : null);
      if (!profileIdentity) {
        setError("SEARCH_A_COMPLETE_HANDLE_TO_OPEN_A_PROFILE");
        return;
      }
      const loaded = await api.getProfile(profileIdentity);
      setProfile(loaded);
      if (loaded.is_self && current) {
        const [friendList, blockedList] = await Promise.all([
          api.getFriends(),
          api.getBlockedUsers().catch(() => []),
        ]);
        setFriends(friendList);
        setBlockedUsers(blockedList);
      } else {
        setFriends([]);
        setBlockedUsers([]);
      }
    } catch (requestError) {
      setProfile(null);
      setError((requestError as Error).message);
    } finally {
      if (!silent) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile(requestedIdentity);
    const timer = window.setInterval(() => void loadProfile(requestedIdentity, true), 5_000);
    return () => window.clearInterval(timer);
  }, [loadProfile, requestedIdentity]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const isOwnProfile = Boolean(profile && viewer && profile.user_id === viewer.user_id);
  const relationship = profile?.friendship_status;
  const avatar = profile?.avatar_url || (profile ? avatarUrl(profile.username) : "");
  const winRate = profile?.records.games_played
    ? `${Math.round((profile.records.wins / profile.records.games_played) * 1000) / 10}%`
    : "0%";
  const relationshipLabel = useMemo(() => {
    if (isOwnProfile) return "YOUR_PROFILE";
    if (relationship === "accepted") return "FRIENDS_CONNECTED";
    if (relationship === "pending_outgoing") return "REQUEST_PENDING";
    if (relationship === "pending_incoming") return "INCOMING_REQUEST";
    if (relationship === "blocked") return "OPERATIVE_BLOCKED";
    return "PUBLIC_OPERATIVE";
  }, [isOwnProfile, relationship]);

  const sendRequest = async () => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      await api.sendFriendRequest(formatAccountIdentity(profile));
      await loadProfile(formatAccountIdentity(profile));
      window.dispatchEvent(new Event("codebreaker-social-changed"));
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const respondToRequest = async (action: "accept" | "decline") => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      await api.respondToFriendRequest(profile.user_id, action);
      await loadProfile(formatAccountIdentity(profile));
      window.dispatchEvent(new Event("codebreaker-social-changed"));
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const startDirectGame = async () => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const roomId = crypto.randomUUID().slice(0, 8);
      await api.challengeFriend(profile.user_id, roomId);
      router.push(`/multiplayer/${roomId}?mode=standard&level=4&repeats=false&direct=true`);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const changeFriendship = async (action: "remove" | "block" | "unblock") => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "remove") await api.removeFriend(profile.user_id);
      else if (action === "block") await api.blockUser(profile.user_id);
      else await api.unblockUser(profile.user_id);
      setMenuOpen(false);
      await loadProfile(formatAccountIdentity(profile));
      window.dispatchEvent(new Event("codebreaker-social-changed"));
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const unblockFromList = async (userId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.unblockUser(userId);
      await loadProfile(requestedIdentity);
      window.dispatchEvent(new Event("codebreaker-social-changed"));
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const updateAvatar = async () => {
    if (!profile || !isOwnProfile) return;
    if (!online) {
      setError("AVATAR_UPDATE_REQUIRES_ONLINE_UPLINK");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api.updateAvatar(nextAvatar(profile.username, profile.avatar_url || undefined));
      setProfile((current) => current ? { ...current, ...response.user } : current);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reportProfile = async () => {
    if (!profile) return;
    const reason = window.prompt("Reason for report:");
    if (!reason?.trim()) return;
    setError(null);
    try {
      await api.reportUser(profile.user_id, reason);
      setNotice("REPORT_SUBMITTED // STORED_FOR_MODERATION");
    } catch (requestError) { setError((requestError as Error).message); }
  };

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#080a08] px-4 pb-5 pt-20 text-slate-100 sm:px-8 sm:pb-8 sm:pt-20 lg:py-8" onClick={(event) => { if (window.matchMedia("(min-width: 1024px)").matches && !profileCardRef.current?.contains(event.target as Node)) onBack(); }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(120,145,103,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(120,145,103,0.08)_1px,transparent_1px)] [background-size:46px_46px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />
      <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[1220px] items-center justify-center">
        <div className="absolute -top-1 left-0 hidden sm:-top-2 lg:block">
          <button type="button" onClick={onBack} className="flex items-center gap-3 text-left font-sans text-xl font-semibold text-slate-100 transition-colors hover:text-[#c9e99a]"><ArrowLeft className="h-6 w-6" strokeWidth={1.7} /> Profile</button>
        </div>
        <motion.section ref={profileCardRef} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="w-full overflow-hidden rounded-[25px] border border-[#69745f]/70 bg-[#111510]/95 shadow-[0_24px_80px_rgba(0,0,0,0.58)]">
          {busy && !profile ? <LoadingState /> : error && !profile ? <ErrorState message={error} /> : profile && (
            <>
              <div className="flex items-center border-b border-[#52604b]/50 px-5 py-4 lg:hidden"><button type="button" onClick={onBack} className="flex items-center gap-3 font-sans text-lg font-semibold text-slate-100 hover:text-[#c9e99a]"><ArrowLeft className="h-5 w-5" /> Profile</button></div>
              <div className="relative overflow-hidden border-y border-[#52604b]/50 px-5 py-8 sm:px-12 sm:py-10">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(155deg,transparent_45%,rgba(112,138,98,0.28)_45.2%,transparent_45.5%),linear-gradient(25deg,transparent_62%,rgba(112,138,98,0.22)_62.2%,transparent_62.5%)]" />
                 <div className={`absolute right-5 top-16 flex items-center gap-2 rounded-full border px-4 py-2 font-mono text-[10px] uppercase tracking-widest ${online ? "border-[#87a967]/40 bg-[#7da35b]/10 text-[#b6d992]" : "border-[#cf6679]/40 bg-[#cf6679]/10 text-[#cf8896]"}`}><span className={`h-2 w-2 rounded-full ${online ? "bg-[#9bdb68] shadow-[0_0_10px_#9bdb68]" : "bg-[#cf6679]"}`} />{online ? "ONLINE" : "OFFLINE"}</div>
                <div className="relative grid items-center gap-8 lg:grid-cols-[250px_1fr_auto]">
                  <div className="flex justify-center lg:justify-start">
                    <div className="relative">
                      <div className="rounded-full border-2 border-[#9ac26d] p-1 shadow-[0_0_22px_rgba(135,190,83,0.25)]"><img src={avatar} alt={`${profile.username} avatar`} className="h-44 w-44 rounded-full bg-[#080a08] object-cover p-2 sm:h-48 sm:w-48" /></div>
                      {isOwnProfile && <button type="button" disabled={busy || !online} onClick={() => void updateAvatar()} aria-label="Change profile avatar" title={online ? "Generate another avatar" : "Avatar changes require an online connection"} className="absolute bottom-1 right-0 rounded-full border border-[#8ba676] bg-[#192019] p-3 text-slate-100 shadow-lg transition-colors hover:bg-[#2c3c29] disabled:cursor-not-allowed disabled:opacity-50"><Camera className="h-5 w-5" /></button>}
                    </div>
                  </div>

                  <div className="min-w-0 text-center lg:text-left">
                    <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#82937a]">{relationshipLabel}</p>
                    <h1 className="mt-2 break-words font-sans text-4xl font-bold tracking-tight text-[#f0f1e8] sm:text-5xl">{profile.username}</h1>
                    <p className="mt-2 font-mono text-sm tracking-[0.3em] text-[#84917b] drop-shadow-[0_0_8px_rgba(132,145,123,0.35)]">#{profile.discriminator}</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-6 text-left lg:justify-start">
                      <MetaStat icon={<UsersRound />} value={String(profile.friend_count)} label="FRIENDS" />
                      <MetaStat icon={<CalendarDays />} value={formatDate(profile.created_at)} label="JOINED" />
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-3 lg:justify-end">
                      {viewer && !isOwnProfile && relationship === null && <button type="button" disabled={busy} onClick={() => void sendRequest()} className="flex items-center gap-2 rounded-xl bg-[#c9e99a] px-5 py-3 font-sans text-sm font-semibold text-[#162010] shadow-[0_0_20px_rgba(177,220,117,0.15)] transition-colors hover:bg-[#daf5ad] disabled:opacity-50"><UserPlus className="h-5 w-5" /> Add Friend</button>}
                      {viewer && !isOwnProfile && relationship === "pending_outgoing" && <button type="button" disabled className="flex items-center gap-2 rounded-xl border border-[#c8b653]/50 bg-[#c8b653]/10 px-5 py-3 font-sans text-sm font-semibold text-[#c8b653]"><Check className="h-5 w-5" /> Friend Request Sent</button>}
                      {viewer && !isOwnProfile && relationship === "pending_incoming" && <div className="flex flex-wrap justify-center gap-2 lg:justify-end"><button type="button" disabled={busy} onClick={() => void respondToRequest("accept")} className="flex items-center gap-2 rounded-xl bg-[#c9e99a] px-4 py-3 font-sans text-sm font-semibold text-[#162010] disabled:opacity-50"><Check className="h-5 w-5" /> Accept</button><button type="button" disabled={busy} onClick={() => void respondToRequest("decline")} className="rounded-xl border border-[#cf6679]/50 px-4 py-3 font-mono text-[10px] uppercase text-[#cf8896] disabled:opacity-50">Decline</button></div>}
                      {viewer && !isOwnProfile && relationship === "blocked" && <button type="button" disabled={busy} onClick={() => void changeFriendship("unblock")} className="rounded-xl border border-[#c9e99a]/50 bg-[#c9e99a]/10 px-5 py-3 font-sans text-sm font-semibold text-[#c9e99a] disabled:opacity-50">Unblock</button>}
                      {viewer && !isOwnProfile && relationship === "accepted" && <button type="button" disabled={busy} onClick={() => void startDirectGame()} className="flex items-center gap-2 rounded-xl bg-[#c9e99a] px-5 py-3 font-sans text-sm font-semibold text-[#162010] shadow-[0_0_20px_rgba(177,220,117,0.15)] transition-colors hover:bg-[#daf5ad] disabled:opacity-50"><Swords className="h-5 w-5" /> Start Game</button>}
                      {viewer && !isOwnProfile && relationship === "accepted" && <button type="button" aria-label="Open direct messages" onClick={() => setShowMessages(true)} className="rounded-xl border border-[#687468] bg-white/[0.02] p-3 text-slate-200 transition-colors hover:border-[#a5bd8c]"><MessageCircle className="h-6 w-6" /></button>}
                      {viewer && !isOwnProfile && <div className="relative"><button type="button" aria-label="More profile actions" onClick={() => setMenuOpen((open) => !open)} className="rounded-xl border border-[#687468] bg-white/[0.02] p-3 text-slate-200 transition-colors hover:border-[#a5bd8c]"><MoreHorizontal className="h-6 w-6" /></button>{menuOpen && <div className="absolute right-0 top-14 z-20 min-w-40 overflow-hidden rounded-xl border border-[#52604b] bg-[#171d16] p-1 shadow-2xl">{relationship === "accepted" && <button type="button" onClick={() => void changeFriendship("remove")} className="w-full rounded-lg px-3 py-2 text-left font-mono text-[9px] uppercase text-[#b9c4b1] hover:bg-white/5">REMOVE_FRIEND</button>}{relationship === "blocked" ? <button type="button" onClick={() => void changeFriendship("unblock")} className="w-full rounded-lg px-3 py-2 text-left font-mono text-[9px] uppercase text-[#c9e99a] hover:bg-white/5">UNBLOCK_OPERATIVE</button> : <button type="button" onClick={() => void changeFriendship("block")} className="w-full rounded-lg px-3 py-2 text-left font-mono text-[9px] uppercase text-[#cf8896] hover:bg-[#cf6679]/10">BLOCK_OPERATIVE</button>}<button type="button" onClick={() => void reportProfile()} className="w-full rounded-lg px-3 py-2 text-left font-mono text-[9px] uppercase text-[#cf8896] hover:bg-[#cf6679]/10">REPORT_OPERATIVE</button></div>}</div>}
                  </div>
                </div>
              </div>

              <div className="px-5 sm:px-12">
                <nav className="flex gap-8 border-b border-[#3c4839]" aria-label="Profile sections">
                  <ProfileTabButton active={tab === "records"} onClick={() => setTab("records")} icon={<Trophy />} label="Records" />
                  <ProfileTabButton active={tab === "friends"} onClick={() => setTab("friends")} icon={<UsersRound />} label={`Friends (${profile.friend_count})`} />
                  <ProfileTabButton active={tab === "about"} onClick={() => setTab("about")} icon={<Info />} label="About" />
                </nav>
                {tab === "records" && <RecordsPanel profile={profile} winRate={winRate} />}
                 {tab === "friends" && <FriendsPanel friends={friends} blockedUsers={blockedUsers} own={Boolean(isOwnProfile)} onUnblock={(userId) => void unblockFromList(userId)} />}
                 {tab === "about" && <AboutPanel profile={profile} online={online} onReport={() => void reportProfile()} />}
                 {notice && <p role="status" className="pb-5 font-mono text-[9px] uppercase text-[#b8dc87]">{notice}</p>}
              </div>
            </>
          )}
          {showMessages && profile && <DirectMessagesPanel profile={profile} onClose={() => setShowMessages(false)} />}
        </motion.section>
      </div>
    </main>
  );
}

function RecordsPanel({ profile, winRate }: { profile: ProfileResponse; winRate: string }) {
  const records = profile.records;
  return <div className="py-7 sm:py-9"><div className="mb-5 flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[#a1b19a]">Operation Records</p><button type="button" disabled className="rounded-xl border border-[#53604f] px-4 py-2 font-sans text-sm text-[#b9c4b1] opacity-80">All Time <span className="ml-5">⌄</span></button></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><RecordCard icon={<Trophy />} value={String(records.wins)} label="Total Wins" /><RecordCard icon={<Target />} value={String(records.games_played)} label="Matches Played" /><RecordCard icon={<Target />} value={winRate} label="Win Rate" /><RecordCard icon={<Flame />} value={String(records.best_score)} label="Best Score" /></div><p className="mb-4 mt-9 font-mono text-[10px] uppercase tracking-[0.4em] text-[#a1b19a]">Mode Breakdown</p><div className="grid gap-4 lg:grid-cols-2"><ModeCard icon={<Flag />} title="Classified Missions" subtitle="Single Player" games={records.games_played} wins={records.wins} rate={winRate} /><ModeCard icon={<Swords />} title="Live Operations" subtitle="Multiplayer" games={0} wins={0} rate="—" /></div></div>;
}

function FriendsPanel({ friends, blockedUsers, own, onUnblock }: { friends: FriendRecord[]; blockedUsers: FriendRecord[]; own: boolean; onUnblock: (userId: string) => void }) {
  const accepted = friends.filter((friend) => friend.status === "accepted");
  return <div className="min-h-64 py-8">
    {own ? <>
      {accepted.length > 0 ? <div className="grid gap-3 sm:grid-cols-2">{accepted.map((friend) => <div key={friend.user_id} className="rounded-xl border border-[#3e4b3c] bg-white/[0.02] p-4 font-mono text-xs text-[#d6dfd0]">{friend.username}<span className="ml-2 text-[#7f8e7a]">#{friend.discriminator}</span></div>)}</div> : <div className="flex min-h-32 items-center justify-center font-mono text-[10px] uppercase tracking-widest text-[#687468]">FRIEND_LIST_PRIVATE_OR_EMPTY</div>}
      {blockedUsers.length > 0 && <div className="mt-8"><p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[#cf8896]">Block List</p><div className="grid gap-3 sm:grid-cols-2">{blockedUsers.map((friend) => <div key={friend.user_id} className="flex items-center justify-between rounded-xl border border-[#cf6679]/20 bg-[#cf6679]/5 p-4"><span className="font-mono text-xs text-[#d6dfd0]">{formatFriendIdentity(friend)}</span><button type="button" onClick={() => onUnblock(friend.user_id)} className="font-mono text-[9px] uppercase text-[#c9e99a] hover:text-white">Unblock</button></div>)}</div></div>}
    </> : <div className="flex min-h-56 items-center justify-center font-mono text-[10px] uppercase tracking-widest text-[#687468]">FRIEND_LIST_PRIVATE_OR_EMPTY</div>}
  </div>;
}

function AboutPanel({ profile, online, onReport }: { profile: ProfileResponse; online: boolean; onReport: () => void }) {
  return <div className="grid min-h-64 gap-4 py-8 sm:grid-cols-2"><div className="rounded-xl border border-[#3e4b3c] bg-white/[0.02] p-5"><p className="font-mono text-[9px] uppercase tracking-widest text-[#748570]">Public Handle</p><p className="mt-3 font-mono text-lg text-[#d6dfd0]">{formatAccountIdentity(profile)}</p></div><div className="rounded-xl border border-[#3e4b3c] bg-white/[0.02] p-5"><p className="font-mono text-[9px] uppercase tracking-widest text-[#748570]">Uplink Status</p><p className="mt-3 font-mono text-lg text-[#d6dfd0]">{online ? "ONLINE" : "OFFLINE"}</p>{!profile.is_self && <button type="button" onClick={onReport} className="mt-5 rounded-lg border border-[#cf6679]/30 px-3 py-2 font-mono text-[9px] uppercase text-[#cf8896] hover:bg-[#cf6679]/10">REPORT_OPERATIVE</button>}</div></div>;
}

function MetaStat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return <div className="flex items-center gap-3"><span className="text-[#b7d890] [&>svg]:h-6 [&>svg]:w-6">{icon}</span><div><p className="font-sans text-lg font-semibold text-[#eef1e7]">{value}</p><p className="font-mono text-[9px] uppercase tracking-widest text-[#899586]">{label}</p></div></div>;
}

function ProfileTabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" onClick={onClick} className={`relative flex items-center gap-3 py-4 font-sans text-base transition-colors ${active ? "text-[#d9edc0]" : "text-[#82907f] hover:text-[#c6d2bd]"}`}><span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>{label}{active && <span className="absolute bottom-0 left-0 right-0 h-1 rounded-full bg-[#b8db85] shadow-[0_0_12px_rgba(184,219,133,0.4)]" />}</button>;
}

function RecordCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return <div className="rounded-xl border border-[#3e4b3c] bg-white/[0.025] p-5"><div className="flex items-center gap-4"><span className="text-[#b8dc87] [&>svg]:h-8 [&>svg]:w-8">{icon}</span><div><p className="font-sans text-3xl font-bold text-[#eef1e7]">{value}</p><p className="font-sans text-sm text-[#a9b4a4]">{label}</p></div></div></div>;
}

function ModeCard({ icon, title, subtitle, games, wins, rate }: { icon: React.ReactNode; title: string; subtitle: string; games: number; wins: number; rate: string }) {
  return <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 overflow-x-auto rounded-xl border border-[#3e4b3c] bg-white/[0.025] p-5"><span className="row-span-2 text-[#b8dc87] [&>svg]:h-8 [&>svg]:w-8">{icon}</span><div><p className="font-sans text-base font-semibold text-[#eef1e7]">{title}</p><p className="font-sans text-sm text-[#8c9b87]">{subtitle}</p></div><ModeValue value={String(wins)} label="Wins" /><ModeValue value={String(games)} label="Played" /><ModeValue value={rate} label="Win Rate" /></div>;
}

function ModeValue({ value, label }: { value: string; label: string }) {
  return <div className="text-right"><p className="font-sans text-lg font-semibold text-[#e6eee0]">{value}</p><p className="font-mono text-[8px] uppercase text-[#81917c]">{label}</p></div>;
}

function LoadingState() {
  return <div className="flex min-h-[520px] items-center justify-center font-mono text-[10px] uppercase tracking-[0.4em] text-[#748570]">LOADING_PROFILE...</div>;
}

function ErrorState({ message }: { message: string }) {
  return <div className="flex min-h-[520px] flex-col items-center justify-center px-6 text-center"><p className="font-mono text-xs uppercase text-[#cf8896]">{message}</p><p className="mt-3 font-mono text-[9px] uppercase tracking-widest text-[#748570]">PROFILE_UNAVAILABLE</p></div>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "UNKNOWN" : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
}
