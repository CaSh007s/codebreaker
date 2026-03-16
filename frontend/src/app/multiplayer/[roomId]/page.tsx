"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket } from "@/hooks/useSocket";
import {
  Board,
  Keyboard,
  FeedbackDots,
  AnimatedHeading,
  HowToPlayModal,
  AbandonMissionModal,
} from "@/components/game/SharedGameUI";

interface Player {
  player_id: string; // Persistent ID
  sid: string;       // Current socket session ID
  username: string;
  avatar: string;
  is_ready: boolean;
  progress: {
    bulls: number;
    cows: number;
    attempts: number;
    last_feedback?: string[];
    guesses: { guess: string; feedback: string[] }[];
    hints_used: number;
    last_points_earned: number;
  };
  points: number;
}

interface Hint {
  position: number;
  digit: string;
}

interface RoomData {
  room_id: string;
  players: Record<string, Player>;
  config: {
    mode: string;
    level: number;
  };
  status: string;
  winner_sid?: string;
  winner_pid?: string;
  resigned_sid?: string;
  end_reason?: "solved" | "resignation";
  target?: string;
}

export default function MultiplayerRoom() {
  const { roomId } = useParams() as { roomId: string };
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isConnected, socket, lastRoomData, lastError, emitEvent } =
    useSocket(roomId);

  const [view, setView] = useState<"setup" | "lobby" | "game" | "full">(
    "setup",
  );
  const [username, setUsername] = useState("");
  const [avatarSeed, setAvatarSeed] = useState("");
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [hintsRevealed, setHintsRevealed] = useState<Hint[]>([]);
  const [playerId, setPlayerId] = useState<string>("");
  const mode = searchParams.get("mode") || "standard";
  const level = parseInt(searchParams.get("level") || "4"); // Default mission length is 4

  // Session Management
  useEffect(() => {
    let pid = localStorage.getItem("codebreaker_player_id");
    if (!pid) {
      pid = `OP_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      localStorage.setItem("codebreaker_player_id", pid);
    }
    setTimeout(() => setPlayerId(pid), 0);

    // Try to recover codename/avatar
    const savedCodename = localStorage.getItem(`cb_codename_${roomId}`);
    const savedAvatar = localStorage.getItem(`cb_avatar_${roomId}`);
    if (savedCodename || savedAvatar) {
      setTimeout(() => {
        if (savedCodename) setUsername(savedCodename);
        if (savedAvatar) {
          const seedMatch = savedAvatar.match(/seed=([^&]+)/);
          if (seedMatch) setAvatarSeed(seedMatch[1]);
        }
      }, 0);
    }
  }, [roomId]);

  const getAvatarUrl = (seed: string) =>
    `https://api.dicebear.com/7.x/pixel-art/svg?seed=${seed}`;

  // Initialize room or join existing
  useEffect(() => {
    if (isConnected && socket && playerId) {
      const savedCodename = localStorage.getItem(`cb_codename_${roomId}`);
      const savedAvatar = localStorage.getItem(`cb_avatar_${roomId}`);
      
      const playerInfo = {
        player_id: playerId,
        username: savedCodename || username,
        avatar: savedAvatar || getAvatarUrl(avatarSeed || username)
      };

      if (searchParams.has("mode")) {
        emitEvent("init_room", {
          room_id: roomId,
          config: { mode, level },
          player_info: playerInfo // Send player info too in case we are re-initializing
        });
      } else {
        emitEvent("join_room", { 
          room_id: roomId,
          player_info: playerInfo 
        });
      }
    }
  }, [isConnected, socket, roomId, mode, level, searchParams, emitEvent, playerId, avatarSeed, username]);

  // Handle room updates and view transitions
  useEffect(() => {
    if (
      lastRoomData &&
      typeof lastRoomData === "object" &&
      "room_id" in lastRoomData &&
      lastRoomData.room_id === roomId
    ) {
      const data = lastRoomData as unknown as RoomData;
      requestAnimationFrame(() => {
        const prevStatus = roomData?.status;
        setRoomData(data);
        
        // Auto-transition view if we are already in the player list
        if (playerId && data.players[playerId]) {
          if (data.status === "playing" || data.status === "finished") {
            setView("game");
          } else if (data.status === "waiting") {
            setView("lobby");
          }
        }

        // Reset hints locally when a new game starts
        if (data.status === "playing" && prevStatus !== "playing") {
          setHintsRevealed([]);
        }
      });
    }
  }, [lastRoomData, roomId, roomData?.status, playerId]);

  // Sync Ready Status after refresh
  useEffect(() => {
    if (roomData && playerId && roomData.players[playerId]) {
      const serverReady = roomData.players[playerId].is_ready;
      if (serverReady !== isReady) {
        setTimeout(() => setIsReady(serverReady), 0);
      }
    }
  }, [roomData, playerId, isReady]);

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
    
    // Persist identity for this room
    localStorage.setItem(`cb_codename_${roomId}`, username);
    localStorage.setItem(`cb_avatar_${roomId}`, finalAvatar);

    emitEvent("setup_player", {
      room_id: roomId,
      player_info: { 
        player_id: playerId,
        username, 
        avatar: finalAvatar 
      },
    });
    setView("lobby");
  };

  const toggleReady = () => {
    const nextReady = !isReady;
    setIsReady(nextReady);
    emitEvent("toggle_ready", { room_id: roomId, is_ready: nextReady });
  };

  const copyLink = () => {
    const cleanUrl = `${window.location.origin}/multiplayer/${roomId}`;
    navigator.clipboard.writeText(cleanUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submitGuess = (guess: string) => {
    emitEvent("submit_guess", { room_id: roomId, guess });
  };

  const handleGetHint = () => {
    const targetLength = roomData?.config.level || 4;
    const maxHints = Math.floor(targetLength / 2);
    const mySid = socket?.id || "";
    const me = roomData?.players[mySid];
    const hintsUsed = me?.progress.hints_used || 0;

    if (hintsUsed >= maxHints) return;
    emitEvent("get_hint", { 
      room_id: roomId, 
      revealed_indices: hintsRevealed.map(h => h.position) 
    });
  };

  // Socket listener for hints
  useEffect(() => {
    if (!socket) return;
    const onHintReceived = (hint: Hint) => {
      setHintsRevealed(prev => [...prev, hint]);
    };
    socket.on("hint_received", onHintReceived);
    return () => {
      socket.off("hint_received", onHintReceived);
    };
  }, [socket]);

  return (
    <main className={`relative flex h-dvh w-full flex-col bg-[#0a0a0b] text-slate-100 items-center overflow-hidden selection:bg-[#538d4e]/30 p-2 sm:p-4 ${view === "game" ? "justify-start" : "justify-center"}`}>
      <BinaryBackground />

      <AnimatePresence>
        {showHowToPlay && (
          <HowToPlayModal onClose={() => setShowHowToPlay(false)} />
        )}
        {showAbandonConfirm && (
          <AbandonMissionModal
            onClose={() => setShowAbandonConfirm(false)}
            onConfirm={() => {
              setShowAbandonConfirm(false);
              emitEvent("surrender", { room_id: roomId });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {view === "setup" && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="z-10 w-full max-w-sm"
          >
            <UserSetup
              username={username}
              setUsername={setUsername}
              avatarSeed={avatarSeed}
              setAvatarSeed={setAvatarSeed}
              onComplete={handleSetupComplete}
              error={error}
              getAvatarUrl={getAvatarUrl}
            />
          </motion.div>
        )}

        {view === "lobby" && (
          <motion.div
            key="lobby"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="z-10 w-full max-w-sm"
          >
            <Lobby
              roomData={roomData}
              isReady={isReady}
              toggleReady={toggleReady}
              roomId={roomId}
              copyLink={copyLink}
              copied={copied}
            />
          </motion.div>
        )}

        {view === "game" && roomData && (
          <div key="game" className="z-10 w-full h-full flex flex-col">
            {/* Full-width Heading & Centered Buttons (Extreme Vertical Compression) */}
            <div className="w-full flex flex-col items-center pt-0 pb-1 shrink-0">
              <AnimatedHeading text="CODEBREAKER" />
              
              {/* Desktop-only Centered Utility Buttons */}
              <div className="hidden sm:flex items-center gap-6 mt-1 pb-1">
                {(() => {
                  const targetLength = roomData.config.level || 4;
                  const maxHints = Math.floor(targetLength / 2);
                  const hintsUsed = roomData.players[socket?.id || ""]?.progress.hints_used || 0;
                  const isLimitReached = hintsUsed >= maxHints;
                  
                  return (
                    <button
                      onClick={handleGetHint}
                      disabled={isLimitReached}
                      className={`px-4 py-2 font-mono text-xs border rounded-lg transition-all uppercase tracking-widest shadow-[0_0_15px_rgba(83,141,78,0.1)] hover:scale-105 active:scale-95 ${isLimitReached ? "opacity-30 border-white/10 text-white/30 cursor-not-allowed" : "text-[#538d4e] border-[#538d4e]/30 bg-[#538d4e]/5 hover:bg-[#538d4e]/20"}`}
                    >
                      {isLimitReached ? "[HINT_LIMIT_REACHED]" : `[GET_HINT] (${hintsUsed}/${maxHints})`}
                    </button>
                  );
                })()}
                <button
                  onClick={() => setShowHowToPlay(true)}
                  className="px-4 py-2 font-mono text-xs text-blue-400 border border-blue-400/30 bg-blue-400/5 hover:bg-blue-400/20 rounded-lg transition-all tracking-widest shadow-[0_0_15px_rgba(96,165,250,0.1)] hover:scale-105 active:scale-95"
                >
                  [FIELD_MANUAL]
                </button>
                <button
                  onClick={() => setShowAbandonConfirm(true)}
                  className="px-6 py-2 font-mono text-xs text-black bg-[#cf6679] hover:bg-[#cf6679]/90 rounded-lg transition-all uppercase font-bold tracking-widest shadow-[0_0_20px_rgba(207,102,121,0.2)] hover:scale-105 active:scale-95"
                >
                  SURRENDER
                </button>
              </div>
            </div>

            {/* Constrained Mission Area */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-5xl mx-auto flex-1 flex flex-col min-h-0"
            >
              <GameView
                roomData={roomData}
                mySid={playerId} // Use persistent playerId for identification in UI
                onSubmitGuess={submitGuess}
                onExit={() => setShowAbandonConfirm(true)}
                onShowHelp={() => setShowHowToPlay(true)}
                hintsRevealed={hintsRevealed}
                setHintsRevealed={setHintsRevealed}
                onHint={handleGetHint}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full-Screen Game Over Splash Evolution */}
      <AnimatePresence>
        {view === "game" && roomData && roomData.status === "finished" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex items-center justify-center bg-[#0a0a0b]/90 backdrop-blur-xl p-4 sm:p-8"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
              className="bg-[#121213]/50 border border-white/10 p-6 sm:p-12 rounded-[2.5rem] text-center space-y-10 max-w-2xl w-full shadow-[0_0_50px_rgba(0,0,0,0.5)] border-t-white/20"
            >
              {(() => {
                const isWinner = roomData.winner_pid === playerId;
                const me = roomData.players[playerId || ""];
                return (
                  <div className="space-y-10">
                    <div className="space-y-4">
                      <h2
                        className={`text-[clamp(1.1rem,4.5vw,2.25rem)] font-serif font-black tracking-tighter uppercase leading-none whitespace-nowrap px-2 ${
                          roomData.end_reason === "resignation"
                            ? (roomData.resigned_sid === socket?.id ? "text-orange-500 drop-shadow-[0_0_25px_rgba(249,115,22,0.5)]" : "text-[#538d4e] drop-shadow-[0_0_25px_rgba(83,141,78,0.5)]")
                            : (isWinner
                                ? "text-[#538d4e] drop-shadow-[0_0_25px_rgba(83,141,78,0.5)]"
                                : "text-[#cf6679] drop-shadow-[0_0_25px_rgba(207,102,121,0.5)]")
                        }`}
                      >
                        {roomData.end_reason === "resignation"
                          ? (roomData.resigned_sid === socket?.id ? "MISSION_ABANDONED" : "UPLINK_SECURED_BY_FORFEIT")
                          : (isWinner ? "ENCRYPTION_SUCCESS" : "INTERCEPTED_BY_ENEMY")}
                      </h2>
                      <div className="flex flex-col items-center gap-1">
                        <p className="text-[#565758] font-mono text-xs sm:text-sm uppercase tracking-[0.4em] opacity-80">
                          {roomData.end_reason === "resignation"
                            ? (roomData.resigned_sid === socket?.id ? "Desertion_Logged_To_Base" : "Hostile_Operative_Fled")
                            : (isWinner ? "Mission_Complete" : "Operative_Down")}
                        </p>
                        <div className="flex gap-4 mt-2">
                          <div className="text-center">
                            <p className="text-[8px] text-[#565758] uppercase font-mono tracking-widest">Points_Earned</p>
                            <p className="text-[#c8b653] font-mono text-lg font-black">+{me?.progress.last_points_earned || 0}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="py-10 border-y border-white/5 relative">
                      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />
                      
                      <span className="block text-[#565758] font-mono text-[10px] uppercase tracking-widest mb-6 opacity-60">
                        Final Target Cipher
                      </span>
                      <div className="flex justify-center gap-3 sm:gap-4">
                        {roomData.target?.split("").map((digit, i) => (
                          <div
                            key={i}
                            className="w-12 h-12 sm:w-16 sm:h-16 border border-[#538d4e]/30 bg-[#538d4e]/10 flex items-center justify-center text-[#538d4e] font-mono font-black text-2xl sm:text-3xl rounded-2xl shadow-[0_0_20px_rgba(83,141,78,0.15)] ring-1 ring-white/5"
                          >
                            {digit}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 sm:gap-8">
                      <div className="bg-white/5 p-4 sm:p-6 rounded-3xl border border-white/5 backdrop-blur-md">
                        <span className="block text-[#565758] font-mono text-[10px] uppercase mb-2 tracking-widest">
                          Operative Tries
                        </span>
                        <span className="text-3xl sm:text-4xl font-black text-slate-100 font-mono">
                          {me?.progress.attempts || 0}
                        </span>
                      </div>
                      <div className="bg-white/5 p-4 sm:p-6 rounded-3xl border border-white/5 backdrop-blur-md">
                        <span className="block text-[#565758] font-mono text-[10px] uppercase mb-2 tracking-widest">
                          Hostile Tries
                        </span>
                        <span className="text-3xl sm:text-4xl font-black text-slate-100 font-mono">
                          {Object.values(roomData.players).find(p => p.player_id !== playerId)?.progress.attempts || 0}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                      <button
                        onClick={() => {/* TODO: Implement Replay Request */}}
                        className="py-5 bg-[#538d4e]/10 hover:bg-[#538d4e]/20 border border-[#538d4e]/30 rounded-2xl font-mono text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] transition-all active:scale-[0.98] text-[#538d4e] shadow-[0_0_20px_rgba(83,141,78,0.1)] group"
                      >
                        <span className="group-hover:tracking-[0.3em] transition-all duration-300">REQUEST_REPLAY</span>
                        <span className="block text-[8px] opacity-40 mt-1 font-normal tracking-normal">[UNAVAILABLE]</span>
                      </button>
                      <button
                        onClick={() => router.push("/multiplayer")}
                        className="py-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-mono text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] transition-all active:scale-[0.98] text-slate-300 group"
                      >
                        <span className="group-hover:tracking-[0.3em] transition-all duration-300">Return_To_Base</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

// --- Components ---

interface UserSetupProps {
  username: string;
  setUsername: (val: string) => void;
  avatarSeed: string;
  setAvatarSeed: (val: string) => void;
  onComplete: () => void;
  error: string;
  getAvatarUrl: (seed: string) => string;
}

function UserSetup({
  username,
  setUsername,
  avatarSeed,
  setAvatarSeed,
  onComplete,
  error,
  getAvatarUrl,
}: UserSetupProps) {
  const currentSeed = avatarSeed || username || "default";
  const refreshAvatar = () =>
    setAvatarSeed(Math.random().toString(36).substring(7));

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-widest font-serif">
          OPERATIVE_SETUP
        </h1>
        <p className="text-[#538d4e] font-mono text-[10px] uppercase tracking-widest">
          Identify yourself to the network
        </p>
      </div>

      <div className="space-y-6 bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-sm shadow-2xl">
        <div className="flex flex-col items-center gap-4">
          <div className="relative group">
            <div className="w-24 h-24 rounded-2xl border-2 border-[#3a3a3c] bg-[#0a0a0b] overflow-hidden flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all group-hover:border-[#538d4e]/50">
              {username || avatarSeed ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={getAvatarUrl(currentSeed)}
                  alt="Avatar"
                  className="w-full h-full"
                />
              ) : (
                <div className="text-[#3a3a3c] scale-150">?</div>
              )}
            </div>
            <button
              onClick={refreshAvatar}
              className="absolute -bottom-2 -right-2 p-1.5 bg-[#1c1c1e] border border-[#3a3a3c] rounded-lg text-[#565758] hover:text-[#538d4e] transition-all shadow-xl"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[#565758] font-mono text-[9px] uppercase tracking-widest opacity-70 ml-1">
            Codename
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="GHOST_STALKER..."
            className="w-full bg-black/40 border border-[#3a3a3c] rounded-lg px-4 py-3 font-mono text-sm focus:border-[#538d4e] outline-none transition-all placeholder:opacity-30"
            maxLength={15}
          />
          {error && (
            <p className="text-[#cf6679] font-mono text-[9px] uppercase animate-pulse">
              {error}
            </p>
          )}
        </div>

        <button
          onClick={onComplete}
          className="w-full py-4 bg-[#538d4e] hover:bg-[#58a352] text-black text-lg font-bold rounded-xl transition-all active:scale-[0.98]"
        >
          INITIALIZE_LINK
        </button>
      </div>
    </div>
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

function Lobby({
  roomData,
  isReady,
  toggleReady,
  roomId,
  copyLink,
  copied,
}: LobbyProps) {
  const players = roomData?.players ? Object.values(roomData.players) : [];

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-widest font-serif uppercase">
          Uplink_Lobby
        </h1>
        <p className="text-[#538d4e] font-mono text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#538d4e] animate-ping" />
          Waiting for players ({players.length}/2)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map((idx) => {
          const player = players[idx];
          return (
            <div
              key={idx}
              className={`relative aspect-square border-2 rounded-2xl flex flex-col items-center justify-center p-4 transition-all gap-3 ${player ? "border-[#538d4e] bg-[#538d4e]/5" : "border-[#3a3a3c] border-dashed opacity-50"}`}
            >
              {player ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={player.avatar}
                    alt={player.username}
                    className="w-16 h-16 rounded-xl shadow-lg"
                  />
                  <span className="font-mono text-[10px] font-bold text-center truncate w-full">
                    {player.username}
                  </span>
                  <div
                    className={`px-2 py-0.5 rounded text-[8px] font-mono uppercase tracking-tighter ${player.is_ready ? "bg-[#538d4e] text-black font-bold" : "bg-white/10 text-slate-400"}`}
                  >
                    {player.is_ready ? "READY" : "PENDING"}
                  </div>
                </>
              ) : (
                <div className="text-[#3a3a3c] animate-pulse">
                  <svg
                    className="w-8 h-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-4">
        <button
          onClick={toggleReady}
          disabled={players.length < 2}
          className={`w-full py-4 text-lg font-bold rounded-xl transition-all active:scale-[0.98] ${isReady ? "bg-white/10 text-white" : "bg-[#538d4e] text-black disabled:opacity-30"}`}
        >
          {isReady ? "CANCEL_READY" : "READY_TO_DEPLOY"}
        </button>

        <div className="p-3 bg-white/5 border border-white/10 rounded-lg text-center space-y-3 relative">
          <div className="space-y-1">
            <span className="text-[#565758] font-mono text-[8px] uppercase tracking-widest block opacity-70">
              Uplink_Target
            </span>
            <code className="text-[#538d4e] font-mono text-xs">{roomId}</code>
          </div>
          <button
            onClick={copyLink}
            className={`w-full py-2 px-4 rounded-md font-mono text-[10px] uppercase transition-all flex items-center justify-center gap-2 border ${copied ? "bg-[#538d4e]/20 border-[#538d4e] text-[#538d4e]" : "bg-white/5 border-white/10 text-slate-400 hover:bg-white/10"}`}
          >
            {copied ? "LINK_COPIED" : "COPY_INVITATION_LINK"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface GameViewProps {
  roomData: RoomData;
  mySid: string;
  onSubmitGuess: (guess: string) => void;
  onExit: () => void;
  onShowHelp: () => void;
  hintsRevealed: Hint[];
  setHintsRevealed: React.Dispatch<React.SetStateAction<Hint[]>>;
  onHint: () => void;
}

function GameView({
  roomData,
  mySid,
  onSubmitGuess,
  onExit,
  onShowHelp,
  hintsRevealed,
  setHintsRevealed,
  onHint,
}: GameViewProps) {
  const [currentGuess, setCurrentGuess] = useState("");
  const me = roomData.players[mySid];
  const opponent = Object.values(roomData.players).find((p) => p.sid !== mySid);
  const targetLength = roomData.config.level || 4;
  const isGameOver = roomData.status === "finished";

  // Local state for struck keys in multiplayer
  const [struckKeys, setStruckKeys] = useState<string[]>([]);
  const toggleStruckKey = (key: string) => {
    setStruckKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handleKeyPress = (num: string) => {
    if (isGameOver) return;
    if (currentGuess.length < targetLength) {
      setCurrentGuess((prev) => prev + num);
    }
  };

  const handleBackspace = () => {
    setCurrentGuess((prev) => prev.slice(0, -1));
  };

  const handleSubmit = () => {
    if (currentGuess.length === targetLength) {
      onSubmitGuess(currentGuess);
      setCurrentGuess("");
    }
  };

  // Mission Policy: Clear hints once they are utilized in the active cipher buffer
  useEffect(() => {
    const remainingHints = hintsRevealed.filter(
      (h) => currentGuess[h.position] !== h.digit
    );
    if (remainingHints.length !== hintsRevealed.length) {
      setHintsRevealed(remainingHints);
    }
  }, [currentGuess, hintsRevealed, setHintsRevealed]);

  return (
    <div className="flex flex-col h-full w-full gap-2 max-h-screen overflow-hidden">
      {/* Top Utility Navbar (Optimized for Mobile, Hidden on Desktop where Buttons are below Heading) */}
      <div className="w-full bg-black/40 backdrop-blur-md border-b border-[#3a3a3c] shrink-0 z-20 sm:hidden">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-center">
          <div className="flex items-center gap-4">
            {(() => {
              const maxHints = Math.floor(targetLength / 2);
              const hintsUsed = me?.progress.hints_used || 0;
              const isLimitReached = hintsUsed >= maxHints;
              return (
                <button
                  onClick={onHint}
                  disabled={isLimitReached}
                  className={`px-3 py-1.5 font-mono text-[10px] border rounded transition-all uppercase tracking-tighter ${isLimitReached ? "opacity-30 border-white/10 text-white/30" : "text-[#538d4e] border-[#538d4e]/30 bg-[#538d4e]/5 hover:bg-[#538d4e]/20"}`}
                >
                  {isLimitReached ? "[HINT_LIMIT_REACHED]" : `[GET_HINT] (${hintsUsed}/${maxHints})`}
                </button>
              );
            })()}
            <button
              onClick={onShowHelp}
              className="px-3 py-1.5 font-mono text-[10px] text-blue-400 border border-blue-400/30 bg-blue-400/5 hover:bg-blue-400/20 rounded transition-all tracking-tighter"
            >
              [FIELD_MANUAL]
            </button>
            <button
              onClick={onExit}
              className="px-4 py-1.5 font-mono text-[10px] text-black bg-[#cf6679] hover:bg-[#cf6679]/90 rounded transition-all uppercase font-bold tracking-tighter shadow-[0_0_15px_rgba(207,102,121,0.2)]"
            >
              SURRENDER
            </button>
          </div>
        </div>
      </div>

      {/* Header Player Cards */}
      <div className="grid grid-cols-2 gap-4 shrink-0 px-2 pt-2">
        {[me, opponent].map((p, idx) => {
          if (!p)
            return (
              <div
                key={idx}
                className="h-24 bg-white/5 rounded-2xl border border-dashed border-[#3a3a3c] animate-pulse"
              />
            );

          const isMe = p.sid === mySid;
          const bulls = p.progress.bulls;

          // Glow intensity/color based on proximity (bulls)
          let glowClass = "";
          if (isMe) {
            glowClass =
              "shadow-[0_0_25px_rgba(200,182,83,0.3)] border-[#c8b653]/30";
          } else {
            if (bulls >= targetLength - 1)
              glowClass =
                "shadow-[0_0_30px_rgba(239,68,68,0.5)] border-red-500/40";
            else if (bulls >= 2)
              glowClass =
                "shadow-[0_0_20px_rgba(168,85,247,0.3)] border-purple-500/30";
            else if (bulls >= 1)
              glowClass =
                "shadow-[0_0_15px_rgba(59,130,246,0.3)] border-blue-500/20";
          }

          return (
            <motion.div
              key={idx}
              layout
              className={`relative p-4 rounded-2xl border-2 transition-all duration-500 bg-[#121213] ${glowClass}`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.avatar} alt="" className="w-10 h-10 rounded-xl" />
                  {isMe && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#538d4e] rounded-full border-2 border-[#121213] animate-pulse" />
                  )}
                </div>
                <div className="overflow-hidden">
                  <p
                    className={`font-mono text-[10px] font-bold truncate ${isMe ? "text-[#c8b653]" : "text-slate-100"}`}
                  >
                    {p.username}
                  </p>
                  <p className="text-[#565758] font-mono text-[8px] uppercase tracking-widest">
                    {p.sid === mySid ? "LOCAL_OPERATIVE" : "REMOTE_ENTITY"}
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-mono text-[#565758] uppercase">
                    Signal_State
                  </span>
                  <FeedbackDots
                    feedback={p.progress.last_feedback || []}
                    codeLength={targetLength}
                  />
                </div>
                <div className="text-right flex flex-col gap-1">
                  <div>
                    <p className="text-[10px] font-mono text-[#565758] uppercase">
                      Tries
                    </p>
                    <p className="text-slate-200 font-mono text-sm font-black tracking-tighter leading-none">
                      {p.progress.attempts.toString().padStart(2, "0")}
                    </p>
                  </div>
                  <div className="mt-1">
                    <p className="text-[9px] font-mono text-[#565758] uppercase">
                      XRP
                    </p>
                    <p className="text-[#c8b653] font-mono text-[11px] font-black leading-none">
                      {p.points || 0}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col min-h-0 relative px-2">
        <div className="flex flex-col h-full">
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-4 px-2">
            <Board
              guesses={me?.progress.guesses || []}
              currentGuess={currentGuess}
              codeLength={targetLength}
              status={roomData.status}
              hintsRevealed={hintsRevealed}
              onHintClick={() => onHint()}
            />
          </div>

          <div className="mt-auto px-4 pb-4 flex flex-col items-center shrink-0">
            <Keyboard
              onAddDigit={handleKeyPress}
              onRemoveDigit={handleBackspace}
              onSubmitGuess={handleSubmit}
              currentGuess={currentGuess}
              codeLength={targetLength}
              status={roomData.status}
              isLoading={false}
              timerActionBlocked={false}
              struckKeys={struckKeys}
              onToggleStruckKey={toggleStruckKey}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BinaryBackground() {
  const [particles, setParticles] = useState<
    { value: number; duration: number; delay: number }[]
  >([]);
  useEffect(() => {
    const p = Array.from({ length: 200 }).map(() => ({
      value: Math.round(Math.random()),
      duration: Math.random() * 3 + 2,
      delay: Math.random() * 5,
    }));
    requestAnimationFrame(() => setParticles(p));
  }, []);

  return (
    <div className="absolute inset-0 opacity-[0.03] pointer-events-none font-mono text-[10px] flex flex-wrap gap-4 leading-none">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.1, 0.5, 0.1] }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
          }}
          className="text-[#565758]"
        >
          {p.value}
        </motion.span>
      ))}
    </div>
  );
}
