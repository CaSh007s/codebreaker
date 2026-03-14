"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import { useGameStore } from "@/store/useGameStore";

export default function Home() {
  const { view } = useGameStore();

  return (
    <main className="flex h-screen w-full flex-col items-center bg-[#121213] text-slate-100 overflow-hidden py-4 px-2 sm:py-8 selection:bg-[#6ca965]/30">
      <AnimatePresence mode="wait">
        {view === "landing" ? (
          <LandingView key="landing" />
        ) : (
          <GameView key="game" />
        )}
      </AnimatePresence>
    </main>
  );
}

function LandingView() {
  const { startNewGame } = useGameStore();
  const [menuState, setMenuState] = useState<"main" | "single" | "category">("main");
  const [category, setCategory] = useState<"standard" | "overdrive">("standard");
  const [showHowToPlay, setShowHowToPlay] = useState(false);

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
      className="relative flex flex-col items-center justify-center p-6 w-full max-w-md h-full gap-8 z-10"
    >
      <BinaryBackground />

      <AnimatePresence>
        {showHowToPlay && (
          <HowToPlayModal onClose={() => setShowHowToPlay(false)} />
        )}
      </AnimatePresence>

      <div className="text-center space-y-4 mb-4">
        <AnimatedHeading text="CODEBREAKER" />
        <p className="text-[#565758] font-mono text-[10px] uppercase tracking-[0.5em] animate-pulse pointer-events-none">
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
                className="w-full text-[#565758] hover:text-slate-300 font-mono text-[10px] uppercase tracking-widest pt-4"
              >
                [BACK_TO_ROOT]
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
              <div className="flex flex-col gap-2 max-h-87.5 overflow-y-auto pr-1">
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
                        className={`font-mono text-sm font-bold ${selectedLevel === i ? "text-[#6ca965]" : "text-slate-300"}`}
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
                        className="text-[#6ca965]"
                      >
                        <div className="w-2 h-2 rounded-full bg-[#6ca965] animate-ping" />
                      </motion.div>
                    )}
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  const l = levels[category][selectedLevel];
                  startNewGame("classic", l.length, l.tries, l.repeats);
                }}
                className="w-full py-4 bg-[#6ca965] hover:bg-[#5a8d54] text-[#121213] text-lg font-bold rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-green-900/20 mt-4"
              >
                DEPLOY_MODULE
              </button>

              <button
                onClick={() => setMenuState("single")}
                className="w-full text-[#565758] hover:text-slate-300 font-mono text-[10px] uppercase tracking-widest pt-2"
              >
                [RECONFIGURE_MODE]
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full flex justify-between gap-4 pt-4 px-2">
        <button
          onClick={() => setShowHowToPlay(true)}
          className="flex-1 py-2 px-3 border border-[#3a3a3c] rounded text-[#565758] hover:text-[#6ca965] hover:border-[#6ca965]/50 font-mono text-[9px] transition-all tracking-tighter uppercase text-center"
        >
          HOW_TO_PLAY.txt
        </button>
        <button className="flex-1 py-2 px-3 border border-[#3a3a3c] rounded text-[#565758] hover:text-slate-300 font-mono text-[9px] transition-all tracking-tighter uppercase text-center cursor-not-allowed">
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
    <h1 className="text-5xl font-bold tracking-[0.2em] sm:text-6xl font-serif flex justify-center">
      {text.split("").map((char, i) => (
        <motion.span
          key={i}
          whileHover={{
            scale: 1.2,
            color: "#6ca965",
            textShadow: "0 0 15px rgba(108,169,101,0.5)",
            y: -5,
          }}
          transition={{ type: "spring", stiffness: 300 }}
          className="inline-block cursor-default"
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
                    ? "opacity-40 cursor-not-allowed border-slate-800"
                    : primary
                      ? "border-[#6ca965] bg-[#6ca965]/5 hover:bg-[#6ca965]/10 shadow-lg"
                      : "border-[#3a3a3c] hover:border-[#565758] bg-white/5 hover:bg-white/10"
                }
            `}
    >
      <div className="relative z-10 flex flex-col translate-x-0 group-hover:translate-x-2 transition-transform">
        <span
          className={`font-mono text-xl font-black tracking-tighter ${primary ? "text-[#6ca965]" : "text-slate-100"}`}
        >
          {label}
        </span>
        <span className="text-[#565758] font-mono text-[9px] uppercase tracking-widest mt-1">
          {desc}
        </span>
      </div>
      {!disabled && (
        <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg
            className={`w-6 h-6 ${primary ? "text-[#6ca965]" : "text-slate-500"}`}
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
          className="absolute inset-0 bg-[#6ca965]/5"
          animate={{ opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
    </button>
  );
}

function GameView() {
  const { startNewGame, status, error, attemptsRemaining, setView } =
    useGameStore();

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex h-full w-full flex-col items-center"
    >
      <div className="flex-none w-full max-w-md flex flex-col items-center mb-4 sm:mb-8">
        <div className="flex w-full justify-between items-start mb-2">
          <button
            onClick={() => setView("landing")}
            className="text-[#565758] hover:text-slate-300 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </button>
        </div>
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
              className={`flex flex-col items-center px-4 py-1 border border-[#3a3a3c] rounded-md transition-colors ${attemptsRemaining !== null && attemptsRemaining <= 5 ? "border-red-500/50 bg-red-500/5" : ""}`}
            >
              <span className="text-[#565758] font-mono text-[8px] uppercase tracking-widest">
                Attempts Rem.
              </span>
              <span
                className={`text-xl font-bold font-mono ${attemptsRemaining !== null && attemptsRemaining <= 5 ? "text-red-400" : "text-slate-100"}`}
              >
                {attemptsRemaining ?? "∞"}
              </span>
            </div>
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
                  className={`text-2xl font-bold mb-6 tracking-tight ${status === "solved" ? "text-[#6ca965]" : "text-[#787c7f]"}`}
                >
                  {status === "solved" ? "SYSTEM CRACKED" : "ACCESS DENIED"}
                </h2>
                <button
                  onClick={() => startNewGame()}
                  className="w-full py-3 bg-[#6ca965] hover:bg-[#5a8d54] text-[#121213] font-bold rounded transition-all active:scale-95"
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
  } = useGameStore();

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (status !== "active") return;
      if (e.key >= "0" && e.key <= "9") addDigit(e.key);
      if (e.key === "Backspace") removeDigit();
      if (e.key === "Enter") submitGuess();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addDigit, removeDigit, submitGuess, status]);

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
          className="col-span-2 h-10 sm:h-12 bg-[#22c55e] hover:bg-[#16a34a] active:bg-[#15803d] text-white font-bold rounded uppercase text-[10px] tracking-widest transition-colors shadow-lg shadow-green-900/20"
        >
          DEL
        </button>
        <button
          onClick={submitGuess}
          disabled={
            currentGuess.length !== codeLength ||
            status !== "active" ||
            isLoading
          }
          className={`
                        col-span-5 h-10 sm:h-12 font-bold rounded uppercase text-xs tracking-widest transition-all
                        ${
                          currentGuess.length === codeLength &&
                          status === "active" &&
                          !isLoading
                            ? "bg-[#166534] hover:bg-[#14532d] text-white cursor-pointer shadow-lg shadow-green-900/30"
                            : "bg-[#565758] text-[#818384] cursor-not-allowed"
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
      className="h-10 sm:h-12 bg-[#818384] hover:bg-[#707273] active:bg-[#565758] text-white text-lg font-bold rounded transition-all flex items-center justify-center"
    >
      {label}
    </button>
  );
}
