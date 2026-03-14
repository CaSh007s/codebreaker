"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { api, LeaderboardEntry } from "@/lib/api";

export default function Home() {
  const { view } = useGameStore();

  return (
    <main className="relative flex h-dvh w-full flex-col bg-[#0a0a0b] text-slate-100 overflow-hidden selection:bg-[#538d4e]/30">
      <TopHeader />
      
      <div className="flex-1 w-full flex flex-col items-center justify-center relative z-10 px-4">
        <AnimatePresence mode="wait">
          {view === "landing" ? (
            <LandingView key="landing" />
          ) : (
            <GameView key="game" />
          )}
        </AnimatePresence>
      </div>


    </main>
  );
}

function TopHeader() {
  const { view, setView } = useGameStore();
  
  return (
    <header className="w-full h-20 flex items-center justify-between px-6 sm:px-10 z-50 shrink-0">
      <AnimatePresence mode="wait">
        {view === "game" ? (
          <motion.button
            key="back"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            onClick={() => setView("landing")}
            className="text-[#565758] hover:text-[#538d4e] transition-colors p-2 rounded-full hover:bg-[#538d4e]/5"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </motion.button>
        ) : (
          <div key="spacer" className="w-10" />
        )}
      </AnimatePresence>

      <OperativeIdentity />
    </header>
  );
}


function LandingView() {
  const { startNewGame, menuState, setMenuState } = useGameStore();
  const [category, setCategory] = useState<"standard" | "overdrive">("standard");
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const levels = {
    standard: [
      {
        label: "ROOKIE",
        length: 3,
        tries: 25,
        repeats: false,
        desc: "Tactical Induction",
      },
      {
        label: "EASY",
        length: 4,
        tries: 20,
        repeats: false,
        desc: "Standard Protocol",
      },
      {
        label: "MEDIUM",
        length: 5,
        tries: 15,
        repeats: false,
        desc: "Advanced Recon",
      },
      {
        label: "HARD",
        length: 6,
        tries: 10,
        repeats: false,
        desc: "Special Ops",
      },
    ],
    overdrive: [
      {
        label: "ELITE",
        length: 5,
        tries: 15,
        repeats: true,
        desc: "Signal Noise Alert",
      },
      {
        label: "MASTER",
        length: 6,
        tries: 10,
        repeats: true,
        desc: "Cryptographic Chaos",
      },
    ],
  };

  const [selectedLevel, setSelectedLevel] = useState(0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex flex-col items-center justify-center py-4 w-full max-w-sm gap-6 sm:gap-8"
    >
      <BinaryBackground />

      <AnimatePresence>
        {showHowToPlay && (
          <HowToPlayModal onClose={() => setShowHowToPlay(false)} />
        )}
        {showLeaderboard && (
            <LeaderboardModal onClose={() => setShowLeaderboard(false)} />
        )}
      </AnimatePresence>

      <div className="text-center space-y-3 mb-2">
        <AnimatedHeading text="CODEBREAKER" />
        <p className="text-[#538d4e] font-mono text-[9px] sm:text-[11px] uppercase tracking-[0.6em] animate-pulse drop-shadow-[0_0_8px_rgba(83,141,78,0.4)]">
          {menuState === "main"
            ? "INITIATING_CONNECTION..."
            : "SELECT_MISSION_PARAMETERS"}
        </p>
      </div>

      <div className="w-full relative min-h-75 flex items-center">
        <AnimatePresence mode="wait">
          {menuState === "main" && (
            <motion.div
              key="main"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="w-full space-y-4"
            >
              <MenuButton
                label="SINGLE_PLAYER"
                desc="Local Decryption Environment"
                onClick={() => setMenuState("single")}
                primary
              />
              <MenuButton
                label="MULTIPLAYER"
                desc="Remote Uplink Pending..."
                onClick={() => {}}
                disabled
              />
            </motion.div>
          )}

          {menuState === "single" && (
            <motion.div
              key="single"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full space-y-4"
            >
              <MenuButton
                label="STANDARD_LEVELS"
                desc="Unique Digit Ciphers"
                onClick={() => {
                  setCategory("standard");
                  setMenuState("category");
                  setSelectedLevel(0);
                }}
              />
              <MenuButton
                label="OVERDRIVE_MODES"
                desc="Repeating Digit Anomalies"
                onClick={() => {
                  setCategory("overdrive");
                  setMenuState("category");
                  setSelectedLevel(0);
                }}
              />
              <button
                onClick={() => setMenuState("main")}
                className="w-full py-3 bg-[#cf6679] hover:bg-[#b15668] text-white font-mono text-xs font-bold rounded-lg transition-all active:scale-95 shadow-[0_0_15px_rgba(207,102,121,0.2)]"
              >
                BACK_TO_ROOT
              </button>
            </motion.div>
          )}

          {menuState === "category" && (
            <motion.div
              key="category"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full space-y-3"
            >
              <div className="flex flex-col gap-2 max-h-[30dvh] overflow-y-auto pr-1 custom-scrollbar">
                {levels[category].map((level, i) => (
                  <button
                    key={level.label}
                    onClick={() => setSelectedLevel(i)}
                    className={`
                                            group relative p-4 rounded-lg border-2 transition-all flex items-center justify-between text-left
                                            ${selectedLevel === i ? "border-[#6ca965] bg-[#6ca965]/5 shadow-[0_0_20px_rgba(108,169,101,0.1)]" : "border-[#3a3a3c] hover:border-[#565758]"}
                                        `}
                  >
                    <div className="flex flex-col translate-x-0 group-hover:translate-x-1 transition-transform">
                      <span
                        className={`font-mono text-sm font-bold ${selectedLevel === i ? "text-[#538d4e]" : "text-slate-300"}`}
                      >
                        {level.label}
                      </span>
                      <span className="text-[#565758] font-mono text-[9px] uppercase">
                        {`${level.desc} // ${level.length}D // ${level.tries}T`}
                      </span>
                    </div>
                    {selectedLevel === i && (
                      <motion.div
                        layoutId="level-indicator"
                        className="text-[#538d4e]"
                      >
                        <div className="w-2 h-2 rounded-full bg-[#538d4e] shadow-[0_0_10px_rgba(83,141,78,0.5)] animate-ping" />
                      </motion.div>
                    )}
                  </button>
                ))}
              </div>
              
              <ModifierPanel />

              <button
                onClick={() => {
                  const l = levels[category][selectedLevel];
                  startNewGame("classic", l.length, l.tries, l.repeats, l.label);
                }}
                className="w-full py-4 bg-[#538d4e] hover:bg-[#58a352] text-black text-lg font-bold rounded-lg transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(83,141,78,0.2)] hover:shadow-[0_0_25px_rgba(83,141,78,0.4)] mt-4"
              >
                DEPLOY_MODULE
              </button>

              <button
                onClick={() => setMenuState("single")}
                className="w-full py-3 bg-[#cf6679] hover:bg-[#b15668] text-white font-mono text-xs font-bold rounded-lg transition-all active:scale-95 shadow-[0_0_15px_rgba(207,102,121,0.2)]"
              >
                RECONFIGURE_MODE
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full flex justify-between gap-4 pt-4 px-2">
        <button
          onClick={() => setShowHowToPlay(true)}
          className="flex-1 py-2 px-3 border border-[#3a3a3c] rounded text-[#565758] hover:text-[#538d4e] hover:border-[#538d4e]/50 font-mono text-[9px] transition-all tracking-tighter uppercase text-center bg-white/5"
        >
          HOW_TO_PLAY.txt
        </button>
        <button 
          onClick={() => setShowLeaderboard(true)}
          className="flex-1 py-2 px-3 border border-[#3a3a3c] rounded text-[#565758] hover:text-slate-100 hover:border-slate-500 font-mono text-[9px] transition-all tracking-tighter uppercase text-center bg-white/5"
        >
          GLOBAL_STATS.reg
        </button>
      </div>

      <footer className="mt-auto text-[#565758] font-mono text-[8px] uppercase tracking-[0.4em]">
        {`© 2026 CODEBREAKER`}
      </footer>
    </motion.div>
  );
}

function AnimatedHeading({ text }: { text: string }) {
  return (
    <h1 className="text-[clamp(1.8rem,10vw,4rem)] sm:text-6xl font-bold tracking-widest sm:tracking-widest font-serif flex justify-center flex-nowrap whitespace-nowrap overflow-hidden py-2">
      {text.split("").map((char, i) => (
        <motion.span
          key={i}
          whileHover={{
            scale: 1.15,
            color: "#538d4e",
            textShadow: "0 0 20px rgba(83,141,78,0.8)",
            y: -2,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className="inline-block cursor-default drop-shadow-[0_0_15px_rgba(255,255,255,0.05)]"
        >
          {char}
        </motion.span>
      ))}
    </h1>
  );
}

function MenuButton({
  label,
  desc,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  desc: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
                w-full group relative p-6 rounded-lg border-2 transition-all text-left overflow-hidden
                ${
                  disabled
                    ? "opacity-30 cursor-not-allowed border-slate-900"
                    : primary
                      ? "border-[#538d4e] bg-[#538d4e]/10 hover:bg-[#538d4e]/15 shadow-[0_0_25px_rgba(83,141,78,0.1)] hover:shadow-[0_0_35px_rgba(83,141,78,0.2)]"
                      : "border-[#3a3a3c] hover:border-slate-500 bg-white/5 hover:bg-white/10"
                }
            `}
    >
      <div className="relative z-10 flex flex-col translate-x-0 group-hover:translate-x-2 transition-transform">
        <span
          className={`font-mono text-xl font-black tracking-tighter ${primary ? "text-[#538d4e]" : "text-slate-100"}`}
        >
          {label}
        </span>
        <span className="text-[#565758] font-mono text-[9px] uppercase tracking-widest mt-1">
          {desc}
        </span>
      </div>
      {!disabled && (
        <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1">
          <svg
            className={`w-6 h-6 ${primary ? "text-[#538d4e]" : "text-slate-500"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M14 5l7 7m0 0l-7 7m7-7H3"
            />
          </svg>
        </div>
      )}
      {primary && !disabled && (
        <motion.div
          className="absolute inset-0 bg-[#538d4e]/5"
          animate={{ opacity: [0.1, 0.25, 0.1] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      )}
    </button>
  );
}

function ModifierPanel() {
  const { timerLimit, setTimerLimit, infiniteMode, setInfiniteMode } = useGameStore();

  const timeOptions = [
    { label: "OFF", value: null },
    { label: "2M", value: 120 },
    { label: "3M", value: 180 },
    { label: "5M", value: 300 },
  ];

  return (
    <div className="w-full space-y-3 p-3 bg-white/5 border border-white/10 rounded-lg my-1">
      <div className="space-y-1.5">
        <span className="text-[#565758] font-mono text-[9px] uppercase tracking-widest block">
          MISSION_PERIOD // {timerLimit ? "COUNTDOWN_ACTIVE" : "UNRESTRICTED"}
        </span>
        <div className="grid grid-cols-4 gap-2">
          {timeOptions.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setTimerLimit(opt.value)}
              className={`
                py-1.5 rounded font-mono text-[10px] transition-all border
                ${
                  timerLimit === opt.value
                    ? "bg-[#538d4e] text-black border-[#538d4e] shadow-[0_0_10px_rgba(83,141,78,0.3)]"
                    : "bg-black/20 text-[#565758] border-[#3a3a3c] hover:border-[#565758]"
                }
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[#565758] font-mono text-[9px] uppercase tracking-widest">
          INFINITE_MODE // OVERRIDE_LIMITS
        </span>
        <button
          onClick={() => setInfiniteMode(!infiniteMode)}
          className={`
            w-10 h-5 rounded-full relative transition-all
            ${infiniteMode ? "bg-[#538d4e]" : "bg-[#3a3a3c]"}
          `}
        >
          <motion.div
            animate={{ x: infiniteMode ? 20 : 2 }}
            className="w-4 h-4 rounded-full bg-white absolute top-0.5 shadow-sm"
          />
        </button>
      </div>
    </div>
  );
}

function GameView() {
  const { 
    startNewGame, 
    status, 
    error, 
    attemptsRemaining, 
    setView, 
    timer, 
    setTimer, 
    username, 
    currentLevelLabel, 
    guesses,
    timerLimit,
    infiniteMode
  } = useGameStore();
  const [isUploading, setIsUploading] = useState(false);
  const [hasUploaded, setHasUploaded] = useState(false);

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === "active") {
      interval = setInterval(() => {
        const nextTime = timer + 1;
        setTimer(nextTime);
        
        // Auto-fail if timer limit reached
        if (timerLimit && nextTime >= timerLimit) {
            // Need a way to set status to failed.
            // For now, I'll rely on the UI to handle it or I can add a surrender call.
            // Actually, let's just use the timer value in UI to block actions.
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status, timer, setTimer, timerLimit]);

  const timeRemaining = timerLimit ? Math.max(0, timerLimit - timer) : null;
  const isTimeUp = timerLimit !== null && timeRemaining === 0;

  // Format time
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Auto-upload score on win
  useEffect(() => {
    if (status === "solved" && !hasUploaded && !isUploading) {
      const upload = async () => {
        setIsUploading(true);
        try {
            await api.postScore({
                username,
                level: currentLevelLabel,
                tries: guesses.length,
                time_seconds: timer
            });
            setHasUploaded(true);
        } catch (e) {
            console.error(e);
        } finally {
            setIsUploading(false);
        }
      };
      upload();
    }
  }, [status, hasUploaded, isUploading, username, currentLevelLabel, guesses.length, timer]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex h-full w-full flex-col items-center"
    >
      <div className="flex-none w-full max-w-md flex flex-col items-center mb-4 sm:mb-8">
        <motion.header
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl font-serif mb-1 uppercase">
            CODEBREAKER
          </h1>
          <p className="text-[#565758] font-mono text-[8px] uppercase tracking-[0.3em] mb-4">
            LOGIC_RECON_v1.0
          </p>
          <div className="flex items-center justify-center gap-4">
            <div
              className={`flex flex-col items-center px-4 py-1 border border-[#3a3a3c] rounded-md transition-colors 
                ${!infiniteMode && attemptsRemaining !== null && attemptsRemaining <= 5 ? "border-red-500/50 bg-red-500/5" : ""}
                ${isTimeUp ? "border-red-500 bg-red-500/10" : ""}
              `}
            >
              <span className="text-[#565758] font-mono text-[8px] uppercase tracking-widest">
                {timerLimit ? "Time Remaining" : "Attempts Rem."}
              </span>
              <span
                className={`text-xl font-bold font-mono 
                    ${!infiniteMode && attemptsRemaining !== null && attemptsRemaining <= 5 ? "text-red-400" : "text-slate-100"}
                    ${isTimeUp || (timerLimit && timeRemaining !== null && timeRemaining <= 30) ? "text-red-500 animate-pulse" : ""}
                `}
              >
                {timerLimit 
                    ? formatTime(timeRemaining || 0) 
                    : (infiniteMode ? "∞" : (attemptsRemaining ?? "∞"))
                }
              </span>
            </div>
            
            {timerLimit && (
               <div className="flex flex-col items-center px-4 py-1 border border-[#3a3a3c] rounded-md">
                 <span className="text-[#565758] font-mono text-[8px] uppercase tracking-widest">Attempts</span>
                 <span className="text-xl font-bold font-mono text-slate-100">
                    {infiniteMode ? guesses.length : (attemptsRemaining ?? "∞")}
                 </span>
               </div>
            )}
          </div>
        </motion.header>
      </div>

      <div className="grow w-full max-w-md flex flex-col justify-center overflow-hidden px-2">
        <Board />
      </div>

      <div className="flex-none w-full max-w-md mt-4">
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-red-400 font-mono text-[10px] uppercase bg-red-400/10 border border-red-400/20 px-3 py-1.5 rounded-full mx-auto w-fit mb-4"
            >
              ERROR: {error}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {status !== "active" && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center bg-[#121213]/80 backdrop-blur-sm z-50 p-6"
            >
              <div className="bg-[#121213] border border-[#3a3a3c] p-8 rounded-xl shadow-2xl text-center max-w-xs w-full">
                <h2
                  className={`text-2xl font-bold mb-2 tracking-tight 
                    ${status === "solved" ? "text-[#538d4e] drop-shadow-[0_0_10px_rgba(83,141,78,0.5)]" : "text-[#787c7f]"}
                    ${isTimeUp ? "text-red-500" : ""}
                  `}
                >
                  {status === "solved" ? "SYSTEM CRACKED" : (isTimeUp ? "TIME EXPIRED" : "ACCESS DENIED")}
                </h2>
                <p className="text-slate-400 font-mono text-xs mb-6 uppercase tracking-widest">
                  {status === "solved"
                    ? "Security bypass successful. Entry recorded."
                    : (isTimeUp ? "Mission window closed. Uplink lost." : "Maximum attempts exceeded. Module locked.")}
                </p>
                <button
                  onClick={() => startNewGame()}
                  className="w-full py-3 bg-[#538d4e] hover:bg-[#58a352] text-black font-bold rounded transition-all active:scale-95 shadow-[0_0_15px_rgba(83,141,78,0.3)]"
                >
                  NEW SESSION
                </button>
                <button
                  onClick={() => setView("landing")}
                  className="w-full mt-3 py-2 text-[#565758] hover:text-slate-300 font-mono text-[10px] uppercase tracking-widest"
                >
                  RETURN_TO_MENU
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Keyboard />
      </div>

      <footer className="flex-none mt-4 text-[#565758] font-mono text-[8px] uppercase tracking-[0.4em]">
        {`© 2026 CODEBREAKER`}
      </footer>
    </motion.div>
  );
}

function BinaryBackground() {
  const [particles, setParticles] = useState<
    { value: number; duration: number; delay: number }[]
  >([]);

  useEffect(() => {
    // Use requestAnimationFrame to avoid "synchronous setState in effect" lint error
    // and ensure we only generate these on the client.
    requestAnimationFrame(() => {
      const p = Array.from({ length: 400 }).map(() => ({
        value: Math.round(Math.random()),
        duration: Math.random() * 3 + 2,
        delay: Math.random() * 5,
      }));
      setParticles(p);
    });
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden opacity-[0.03] pointer-events-none select-none font-mono text-[10px] flex flex-wrap gap-4 leading-none">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          animate={{
            opacity: [0.2, 1, 0.2],
            color: ["#565758", "#6ca965", "#565758"],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
          }}
        >
          {p.value}
        </motion.span>
      ))}
    </div>
  );
}

function HowToPlayModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-[#121213]/90 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="bg-[#121213] border border-[#3a3a3c] p-8 rounded-2xl max-w-md w-full shadow-2xl space-y-6"
      >
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold tracking-tight font-serif uppercase">
            Operation: Codebreaker
          </h3>
          <button
            onClick={onClose}
            className="text-[#565758] hover:text-slate-100 transition-colors uppercase font-mono text-xs"
          >
            [EXIT]
          </button>
        </div>

        <div className="space-y-4 font-mono text-[11px] leading-relaxed text-slate-400 uppercase">
          <p className="border-l-2 border-[#6ca965] pl-4">
            Objective: Crack the randomly generated numeric cipher.
          </p>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-[#6ca965]" />
              <span>BULL: Correct digit in the correct position.</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-[#c8b653]" />
              <span>COW: Correct digit in the wrong position.</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-[#787c7f]" />
              <span>GRAY: Digit not present in code.</span>
            </div>
          </div>

          <p className="bg-[#3a3a3c]/20 p-3 rounded italic text-[#565758]">
            Note: Feedback dots are shuffled. Their position does NOT correspond
            to the position of the digits in your guess.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 bg-[#3a3a3c] hover:bg-[#4a4a4c] text-slate-100 font-bold rounded-lg transition-all"
        >
          ACKNOWLEDGED
        </button>
      </motion.div>
    </motion.div>
  );
}

function OperativeIdentity() {
    const { username, setUsername, view, menuState } = useGameStore();
    
    // Only editable on the main landing page
    const isEditable = view === "landing" && menuState === "main";

    const generateNewAlias = () => {
        if (!isEditable) return;
        const prefixes = ["VOID", "CYPHER", "LOGIC", "GHOST", "SIGNAL", "DECODER", "PROXY"];
        const suffixes = ["WALKER", "KID", "STALKER", "BLADE", "REAPER", "PULSE", "BREAKER"];
        const randomNum = Math.floor(Math.random() * 900) + 100;
        const newAlias = `${prefixes[Math.floor(Math.random() * prefixes.length)]}_${suffixes[Math.floor(Math.random() * suffixes.length)]}_${randomNum}`;
        setUsername(newAlias);
    };

    return (
        <div className="flex flex-col items-end gap-1 p-2 border border-[#3a3a3c] rounded-lg bg-black/40 backdrop-blur-md shadow-[0_0_20px_rgba(0,0,0,0.5)] border-t-[#565758]/30">
            <span className="text-[#565758] font-mono text-[7px] uppercase tracking-widest">OPERATIVE_ID</span>
            <div className="flex items-center gap-3">
                <span className="text-[#538d4e] font-mono text-[11px] font-bold tracking-tight drop-shadow-[0_0_5px_rgba(83,141,78,0.3)]">{username}</span>
                {isEditable && (
                    <button 
                        onClick={generateNewAlias}
                        className="p-1 hover:bg-[#538d4e]/10 rounded transition-colors group"
                        title="Regenerate Alias"
                    >
                        <svg className="w-3.5 h-3.5 text-[#565758] group-hover:text-[#538d4e] transition-all group-hover:rotate-180 duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}

function LeaderboardModal({ onClose }: { onClose: () => void }) {
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getLeaderboard().then((data: LeaderboardEntry[]) => {
            setEntries(data);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl"
        >
            <motion.div 
                initial={{ scale: 0.95, y: 10, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                className="bg-[#0f0f10] border border-[#3a3a3c] p-6 sm:p-8 rounded-2xl max-w-lg w-full shadow-[0_0_50px_rgba(0,0,0,1)] border-t-[#565758]/50 space-y-6"
            >
                <div className="flex justify-between items-center border-b border-[#3a3a3c] pb-4">
                    <h3 className="text-xl font-bold tracking-tight font-serif uppercase text-[#538d4e] drop-shadow-[0_0_10px_rgba(83,141,78,0.3)]">CENTRAL_REGISTRY.reg</h3>
                    <button onClick={onClose} className="text-[#565758] hover:text-white transition-colors uppercase font-mono text-[10px] bg-white/5 px-2 py-1 rounded">
                        [CLOSE]
                    </button>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full font-mono text-[9px] sm:text-[10px] text-left uppercase">
                        <thead className="text-[#565758] border-b border-[#3a3a3c]/30">
                            <tr>
                                <th className="pb-2 px-1">RK</th>
                                <th className="pb-2 px-1">OPERATIVE</th>
                                <th className="pb-2 px-1">MISSION</th>
                                <th className="pb-2 px-1">EFF.</th>
                                <th className="pb-2 px-1">TIME</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-300">
                            {loading ? (
                                <tr><td colSpan={5} className="py-8 text-center animate-pulse text-[#538d4e]">ACCESSING_DECRYPTED_RECORDS...</td></tr>
                            ) : entries.length === 0 ? (
                                <tr><td colSpan={5} className="py-8 text-center text-[#565758]">NO_SUCCESSFUL_BREACHES_DETECTED</td></tr>
                            ) : entries.map((e, i) => (
                                <tr key={i} className="border-b border-[#3a3a3c]/10 hover:bg-white/5 transition-colors group">
                                    <td className="py-3 px-1 text-[#565758]">{(i + 1).toString().padStart(2, '0')}</td>
                                    <td className="py-3 px-1 text-slate-100 font-bold group-hover:text-[#538d4e] transition-colors">{e.username}</td>
                                    <td className="py-3 px-1 text-[#c8b653] font-black">{e.level}</td>
                                    <td className="py-3 px-1">{e.tries}T</td>
                                    <td className="py-3 px-1 text-slate-100">{e.time_seconds}S</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="text-[8px] text-[#565758] font-mono uppercase tracking-[0.3em] text-center italic opacity-80">
                    High-efficiency breaches synchronized via encrypted uplink.
                </div>
            </motion.div>
        </motion.div>
    );
}

function Board() {
  const { guesses, currentGuess, codeLength, status } = useGameStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when a new guess is added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [guesses.length]);

  // Render all existing guesses + 1 active row if game is active
  const totalRows = status === "active" ? guesses.length + 1 : guesses.length;
  // Always show at least some empty rows for aesthetic if board is empty
  const displayRows = Math.max(totalRows, 6);
  const rows = Array.from({ length: displayRows });

  return (
    <div
      ref={scrollRef}
      className="flex flex-col gap-1.5 w-full overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#3a3a3c] scrollbar-track-transparent custom-scrollbar"
      style={{ maxHeight: "100%" }}
    >
      {rows.map((_, i) => {
        const guessObj = guesses[i];
        const isCurrent = i === guesses.length && status === "active";
        const content = guessObj
          ? guessObj.guess
          : isCurrent
            ? currentGuess
            : "";
        const feedback = guessObj ? guessObj.feedback : [];

        return (
          <GuessRow
            key={i}
            content={content}
            codeLength={codeLength}
            feedback={feedback}
            isActive={isCurrent}
            isCompleted={!!guessObj}
          />
        );
      })}
    </div>
  );
}

function GuessRow({
  content,
  codeLength,
  feedback,
  isActive,
  isCompleted,
}: {
  content: string;
  codeLength: number;
  feedback: string[];
  isActive: boolean;
  isCompleted: boolean;
}) {
  const digits = content.split("");
  const placeholders = Array.from({ length: codeLength });

  return (
    <motion.div
      layout
      className={`flex items-center gap-3 w-full p-1 rounded-lg transition-colors ${isActive ? "bg-[#3a3a3c]/10 border border-[#3a3a3c]/30" : "border border-transparent"}`}
    >
      <div className="flex gap-1.5 grow justify-center">
        {placeholders.map((_, i) => (
          <DigitTile
            key={i}
            digit={digits[i] || ""}
            isActive={isActive && i === digits.length}
            isCompleted={isCompleted}
            delay={i * 0.1}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 w-16 justify-center">
        <FeedbackDots feedback={feedback} codeLength={codeLength} />
      </div>
    </motion.div>
  );
}

function DigitTile({
  digit,
  isActive,
  isCompleted,
  delay,
}: {
  digit: string;
  isActive: boolean;
  isCompleted: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={isCompleted ? { rotateX: 0 } : false}
      animate={isCompleted ? { rotateX: [0, 90, 0] } : {}}
      transition={{ duration: 0.5, delay }}
      className={`
                w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-xl sm:text-2xl font-mono font-bold border-2 transition-all duration-200 rounded
                ${digit ? "border-[#565758] bg-[#121213] text-white" : "border-[#3a3a3c] bg-[#121213] text-[#3a3a3c]"}
                ${isActive ? "border-[#818384]" : ""}
                ${isCompleted ? "border-[#3a3a3c] opacity-100" : ""}
            `}
    >
      {digit}
    </motion.div>
  );
}

function FeedbackDots({
  feedback,
  codeLength,
}: {
  feedback: string[];
  codeLength: number;
}) {
  const dots = [...feedback];
  while (dots.length < codeLength) {
    dots.push("hollow");
  }

  // Adjust grid columns based on code length for better layout
  const cols = codeLength > 4 ? "grid-cols-3" : "grid-cols-2";

  return (
    <div className={`grid ${cols} gap-1.5`}>
      {dots.map((type, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: i * 0.1 + 0.5, type: "spring", stiffness: 300 }}
          className={`
                        w-2.5 h-2.5 rounded-full border
                        ${type === "bull" ? "bg-[#6ca965] border-[#6ca965]" : ""}
                        ${type === "cow" ? "bg-[#c8b653] border-[#c8b653]" : ""}
                        ${type === "gray" ? "bg-[#787c7f] border-[#787c7f]" : ""}
                        ${type === "hollow" ? "bg-transparent border-[#3a3a3c]" : ""}
                    `}
        />
      ))}
    </div>
  );
}

function Keyboard() {
  const {
    addDigit,
    removeDigit,
    submitGuess,
    currentGuess,
    codeLength,
    status,
    isLoading,
    timer,
    timerLimit,
  } = useGameStore();

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTimeUp = timerLimit !== null && (timerLimit - timer) <= 0;
      if (status !== "active" || isTimeUp) return;
      if (e.key >= "0" && e.key <= "9") addDigit(e.key);
      if (e.key === "Backspace") removeDigit();
      if (e.key === "Enter") submitGuess();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addDigit, removeDigit, submitGuess, status, timer, timerLimit]);

  return (
    <div className="w-full max-w-sm flex flex-col gap-1.5 mt-auto pb-4">
      <div className="grid grid-cols-5 gap-1.5">
        {keys.slice(0, 5).map((k) => (
          <KeyButton key={k} label={k} onClick={() => addDigit(k)} />
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {keys.slice(5).map((k) => (
          <KeyButton key={k} label={k} onClick={() => addDigit(k)} />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5 mt-1">
        <button
          onClick={removeDigit}
          className="col-span-2 h-10 sm:h-12 bg-[#cf6679] hover:bg-[#b15668] active:bg-[#934656] text-white font-bold rounded uppercase text-[10px] tracking-widest transition-all shadow-[0_0_15px_rgba(207,102,121,0.2)] active:scale-95"
        >
          DEL
        </button>
        <button
          onClick={submitGuess}
          disabled={
            currentGuess.length !== codeLength ||
            status !== "active" ||
            isLoading ||
            (timerLimit !== null && (timerLimit - timer) <= 0)
          }
          className={`
                        col-span-5 h-10 sm:h-12 font-bold rounded uppercase text-xs tracking-widest transition-all
                        ${
                          currentGuess.length === codeLength &&
                          status === "active" &&
                          !isLoading
                            ? "bg-[#538d4e] hover:bg-[#58a352] text-black cursor-pointer shadow-[0_0_20px_rgba(83,141,78,0.3)] hover:shadow-[0_0_30px_rgba(83,141,78,0.5)] active:scale-95"
                            : "bg-[#3a3a3c] text-[#565758] cursor-not-allowed"
                        }
                        ${isLoading ? "animate-pulse" : ""}
                    `}
        >
          {isLoading ? "PROCESSING..." : "SUBMIT"}
        </button>
      </div>
    </div>
  );
}

function KeyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-10 sm:h-12 bg-[#565758] hover:bg-slate-500 active:bg-slate-600 text-white text-lg font-bold rounded transition-all flex items-center justify-center hover:scale-[1.05] active:scale-95 shadow-md"
    >
      {label}
    </button>
  );
}
