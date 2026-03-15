"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSocket } from "@/hooks/useSocket";

interface Player {
  sid: string;
  username: string;
  avatar: string;
  is_ready: boolean;
  progress: {
    bulls: number;
    cows: number;
    attempts: number;
  };
}

interface RoomData {
  room_id: string;
  players: Record<string, Player>;
  config: {
    mode: string;
    level: number;
  };
  status: string;
}

export default function MultiplayerRoom() {
  const { roomId } = useParams() as { roomId: string };
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isConnected, socket, lastRoomData, lastError, emitEvent } = useSocket(roomId);

  const [view, setView] = useState<"setup" | "lobby" | "game" | "full">("setup");
  const [username, setUsername] = useState("");
  const [avatarSeed, setAvatarSeed] = useState("");
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const mode = searchParams.get("mode") || "standard";
  const level = parseInt(searchParams.get("level") || "0");

  const getAvatarUrl = (seed: string) => `https://api.dicebear.com/7.x/pixel-art/svg?seed=${seed}`;

  // Initialize room or join existing
  useEffect(() => {
    if (isConnected && socket) {
      if (searchParams.has("mode")) {
        emitEvent("init_room", {
          room_id: roomId,
          config: { mode, level }
        });
      } else {
        emitEvent("join_room", { room_id: roomId });
      }
    }
  }, [isConnected, socket, roomId, mode, level, searchParams, emitEvent]);

  // Handle room updates
  useEffect(() => {
    if (lastRoomData && typeof lastRoomData === "object" && "room_id" in lastRoomData && lastRoomData.room_id === roomId) {
      requestAnimationFrame(() => {
        setRoomData(lastRoomData as unknown as RoomData);
      });
    }
  }, [lastRoomData, roomId]);

  // Handle errors
  useEffect(() => {
    if (lastError && typeof lastError === "object" && "message" in lastError) {
      const msg = lastError.message as string;
      if (msg === "Room is full") {
        router.push("/multiplayer/full");
      } else if (msg === "Room not found") {
        router.push("/multiplayer");
      } else {
        requestAnimationFrame(() => {
          setError(msg || "AN_ERROR_OCCURRED");
        });
      }
    }
  }, [lastError, router]);

  const handleSetupComplete = () => {
    if (!username.trim()) {
      setError("ENTER_OPERATIVE_CODENAME");
      return;
    }
    const finalAvatar = getAvatarUrl(avatarSeed || username);
    emitEvent("setup_player", {
      room_id: roomId,
      player_info: { username, avatar: finalAvatar }
    });
    setView("lobby");
  };

  const toggleReady = () => {
    const nextReady = !isReady;
    setIsReady(nextReady);
    emitEvent("toggle_ready", { room_id: roomId, is_ready: nextReady });
  };

  const copyLink = () => {
    // Copy the clean URL without query params so joiners call join_room, not init_room
    const cleanUrl = `${window.location.origin}/multiplayer/${roomId}`;
    navigator.clipboard.writeText(cleanUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (view === "setup") {
    return <UserSetup 
      username={username} 
      setUsername={setUsername} 
      avatarSeed={avatarSeed}
      setAvatarSeed={setAvatarSeed}
      onComplete={handleSetupComplete}
      error={error}
      getAvatarUrl={getAvatarUrl}
    />;
  }

  if (view === "lobby") {
    return <Lobby 
      roomData={roomData} 
      isReady={isReady} 
      toggleReady={toggleReady}
      roomId={roomId}
      copyLink={copyLink}
      copied={copied}
    />;
  }

  return <div>Multiplayer Game Loading...</div>;
}

interface UserSetupProps {
  username: string;
  setUsername: (val: string) => void;
  avatarSeed: string;
  setAvatarSeed: (val: string) => void;
  onComplete: () => void;
  error: string;
  getAvatarUrl: (seed: string) => string;
}

function UserSetup({ username, setUsername, avatarSeed, setAvatarSeed, onComplete, error, getAvatarUrl }: UserSetupProps) {
  const currentSeed = avatarSeed || username || "default";

  const refreshAvatar = () => {
    setAvatarSeed(Math.random().toString(36).substring(7));
  };
  return (
    <main className="relative flex h-dvh w-full flex-col bg-[#0a0a0b] text-slate-100 items-center justify-center p-6 sm:p-10">
      <BinaryBackground />
      <div className="z-10 w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-widest font-serif">OPERATIVE_SETUP</h1>
          <p className="text-[#538d4e] font-mono text-[10px] uppercase tracking-widest">Identify yourself to the network</p>
        </div>

        <div className="space-y-6 bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-sm shadow-2xl">
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <div className="w-24 h-24 rounded-2xl border-2 border-[#3a3a3c] bg-[#0a0a0b] overflow-hidden flex items-center justify-center relative shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all group-hover:border-[#538d4e]/50">
                {username || avatarSeed ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={getAvatarUrl(currentSeed)} alt="Avatar" className="w-full h-full" />
                ) : (
                  <div className="text-[#3a3a3c] scale-150">?</div>
                )}
              </div>
              
              <button 
                onClick={refreshAvatar}
                className="absolute -bottom-2 -right-2 p-1.5 bg-[#1c1c1e] border border-[#3a3a3c] rounded-lg text-[#565758] hover:text-[#538d4e] hover:border-[#538d4e] transition-all shadow-xl"
                title="Regenerate Avatar"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <span className="text-[#565758] font-mono text-[9px] uppercase tracking-widest animate-pulse">Genetic_Profile_Generated</span>
          </div>

          <div className="space-y-2">
            <label className="text-[#565758] font-mono text-[9px] uppercase tracking-widest ml-1 opacity-70">Codename</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="GHOST_STALKER..."
              className="w-full bg-black/40 border border-[#3a3a3c] rounded-lg px-4 py-3 font-mono text-sm focus:border-[#538d4e] outline-none transition-all placeholder:opacity-30 selection:bg-[#538d4e]/30"
              maxLength={15}
            />
            {error && <p className="text-[#cf6679] font-mono text-[9px] uppercase animate-pulse">{error}</p>}
          </div>

          <button
            onClick={onComplete}
            className="w-full py-4 bg-[#538d4e] hover:bg-[#58a352] text-black text-lg font-bold rounded-xl transition-all active:scale-[0.98] shadow-[0_0_30px_rgba(83,141,78,0.2)]"
          >
            INITIALIZE_LINK
          </button>
        </div>
      </div>
    </main>
  );
}

interface LobbyProps {
  roomData: RoomData | null;
  isReady: boolean;
  toggleReady: () => void;
  roomId: string;
  copyLink: () => void;
  copied: boolean;
}

function Lobby({ roomData, isReady, toggleReady, roomId, copyLink, copied }: LobbyProps) {
  const players = roomData?.players ? Object.values(roomData.players) : [];
  
  return (
    <main className="relative flex h-dvh w-full flex-col bg-[#0a0a0b] text-slate-100 items-center justify-center p-6 sm:p-10">
      <BinaryBackground />
      <div className="z-10 w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-widest font-serif uppercase">Uplink_Lobby</h1>
          <p className="text-[#538d4e] font-mono text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#538d4e] animate-ping" />
            Waiting for players ({players.length}/2)
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[0, 1].map((idx) => {
            const player = players[idx];
            return (
              <div key={idx} className={`relative aspect-square border-2 rounded-2xl flex flex-col items-center justify-center p-4 transition-all gap-3 ${player ? 'border-[#538d4e] bg-[#538d4e]/5 shadow-[0_0_20px_rgba(83,141,78,0.05)]' : 'border-[#3a3a3c] border-dashed bg-white/5 opacity-50'}`}>
                {player ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={player.avatar} alt={player.username} className="w-16 h-16 rounded-xl shadow-lg" />
                    <span className="font-mono text-[10px] font-bold text-center truncate w-full">{player.username}</span>
                    <div className={`px-2 py-0.5 rounded text-[8px] font-mono uppercase tracking-tighter ${player.is_ready ? 'bg-[#538d4e] text-black font-bold' : 'bg-white/10 text-slate-400'}`}>
                      {player.is_ready ? 'READY' : 'PENDING'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[#3a3a3c] animate-pulse">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <span className="font-mono text-[8px] text-[#565758] uppercase">AWAITING_SIGNAL</span>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-4">
          <button
            onClick={toggleReady}
            disabled={players.length < 2}
            className={`w-full py-4 text-lg font-bold rounded-xl transition-all active:scale-[0.98] shadow-[0_0_30px_rgba(83,141,78,0.15)] ${isReady ? 'bg-white/10 text-white' : 'bg-[#538d4e] text-black disabled:opacity-30 disabled:cursor-not-allowed'}`}
          >
            {isReady ? 'CANCEL_READY' : 'READY_TO_DEPLOY'}
          </button>
          
          <div className="p-3 bg-white/5 border border-white/10 rounded-lg text-center space-y-3 relative">
             <div className="space-y-1">
               <span className="text-[#565758] font-mono text-[8px] uppercase tracking-widest block opacity-70">Uplink_Target</span>
               <code className="text-[#538d4e] font-mono text-xs">{roomId}</code>
             </div>
             
             <button 
               onClick={copyLink}
               className={`w-full py-2 px-4 rounded-md font-mono text-[10px] uppercase transition-all flex items-center justify-center gap-2 border ${
                 copied 
                 ? 'bg-[#538d4e]/20 border-[#538d4e] text-[#538d4e]' 
                 : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20'
               }`}
             >
               {copied ? (
                 <>
                   <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                   </svg>
                   LINK_COPIED
                 </>
               ) : (
                 <>
                   <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                   </svg>
                   COPY_INVITATION_LINK
                 </>
               )}
             </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function BinaryBackground() {
  const [particles, setParticles] = useState<{ value: number; duration: number; delay: number }[]>([]);

  useEffect(() => {
    const p = Array.from({ length: 200 }).map(() => ({
      value: Math.round(Math.random()),
      duration: Math.random() * 3 + 2,
      delay: Math.random() * 5,
    }));
    requestAnimationFrame(() => {
      setParticles(p);
    });
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden opacity-[0.03] pointer-events-none select-none font-mono text-[10px] flex flex-wrap gap-4 leading-none">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.1, 0.5, 0.1] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay }}
          className="text-[#565758]"
        >
          {p.value}
        </motion.span>
      ))}
    </div>
  );
}
