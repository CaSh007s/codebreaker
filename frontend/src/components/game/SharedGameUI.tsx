"use client";

import { useRef, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// --- Types ---

export interface Guess {
  guess: string;
  feedback: string[];
}

export interface Hint {
  position: number;
  digit: string;
}

// --- Components ---

export function DigitTile({
  digit,
  isActive,
  isCompleted,
  isHint,
  delay,
}: {
  digit: string;
  isActive: boolean;
  isCompleted: boolean;
  isHint?: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={isCompleted ? { rotateX: 0 } : false}
      animate={isCompleted ? { rotateX: [0, 90, 0] } : {}}
      whileTap={{ scale: 0.95 }}
      transition={{ 
        rotateX: { duration: 0.5, delay },
        scale: { type: "spring", stiffness: 400, damping: 17 }
      }}
      className={`
                w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-xl sm:text-2xl font-mono font-bold border-2 transition-all duration-200 rounded
                ${isHint ? "border-[#538d4e]/50 bg-[#538d4e]/10 text-[#538d4e] shadow-[0_0_10px_rgba(83,141,78,0.2)] cursor-default" : 
                  digit ? "border-[#565758] bg-[#121213] text-white" : "border-[#3a3a3c] bg-[#121213] text-[#3a3a3c]"}
                ${isActive ? "border-[#818384]" : ""}
                ${isCompleted ? "border-[#3a3a3c] opacity-100" : ""}
                ${!isHint && !isCompleted ? "hover:border-[#538d4e]/50 cursor-pointer" : ""}
            `}
    >
      {digit}
    </motion.div>
  );
}

export function FeedbackDots({
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

export function GuessRow({
  content,
  codeLength,
  feedback,
  isActive,
  isCompleted,
  hints = [],
}: {
  content: string;
  codeLength: number;
  feedback: string[];
  isActive: boolean;
  isCompleted: boolean;
  hints?: Hint[];
}) {
  const digits = content.split("");
  const placeholders = Array.from({ length: codeLength });

  return (
    <motion.div
      layout
      className={`flex items-center gap-3 w-full p-1 rounded-lg transition-colors ${isActive ? "bg-[#3a3a3c]/10 border border-[#3a3a3c]/30" : "border border-transparent"}`}
    >
      <div className="flex gap-1.5 grow justify-center">
        {placeholders.map((_, i) => {
          const hint = hints.find(h => h.position === i);
          return (
            <DigitTile
                key={i}
                digit={hint ? hint.digit : (digits[i] || "")}
                isActive={isActive && i === digits.length}
                isCompleted={isCompleted}
                isHint={!!hint}
                delay={i * 0.1}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5 w-16 justify-center">
        <FeedbackDots feedback={feedback} codeLength={codeLength} />
      </div>
    </motion.div>
  );
}

export function Board({ 
  guesses, 
  currentGuess, 
  codeLength, 
  status, 
  hintsRevealed,
}: {
  guesses: Guess[];
  currentGuess: string;
  codeLength: number;
  status: string;
  hintsRevealed: Hint[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tactical Auto-Scroll: Ensure the latest signal analysis is always in focus
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current;
      // Use requestAnimationFrame to ensure the DOM nodes for new guesses are rendered 
      // before calculating the scroll position.
      requestAnimationFrame(() => {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  }, [guesses.length, status, currentGuess.length]);

  const totalRows = (status === "active" || status === "playing") ? guesses.length + 1 : guesses.length;
  const displayRows = Math.max(totalRows, 6);
  const rows = Array.from({ length: displayRows });

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 w-full overflow-y-auto no-scrollbar scroll-smooth"
    >
      <div className="flex flex-col gap-1.5 py-2">
        {rows.map((_, i) => {
          const guessObj = guesses[i];
          const isCurrent = i === guesses.length && (status === "active" || status === "playing");
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
              hints={isCurrent ? hintsRevealed : []}
            />
          );
        })}
      </div>
    </div>
  );
}

export function Keyboard({
  onAddDigit,
  onRemoveDigit,
  onSubmitGuess,
  currentGuess,
  codeLength,
  status,
  isLoading,
  timerActionBlocked,
  struckKeys,
  onToggleStruckKey
}: {
  onAddDigit: (digit: string) => void;
  onRemoveDigit: () => void;
  onSubmitGuess: () => void;
  currentGuess: string;
  codeLength: number;
  status: string;
  isLoading: boolean;
  timerActionBlocked: boolean;
  struckKeys: string[];
  onToggleStruckKey: (key: string) => void;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(status === "active" || status === "playing") || timerActionBlocked || isLoading) return;
      if (e.key >= "0" && e.key <= "9") onAddDigit(e.key);
      if (e.key === "Backspace") onRemoveDigit();
      if (e.key === "Enter") onSubmitGuess();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onAddDigit, onRemoveDigit, onSubmitGuess, status, timerActionBlocked, isLoading]);

  return (
    <div className="w-full max-w-sm flex flex-col gap-1.5 mt-auto pb-4">
      <div className="grid grid-cols-5 gap-1.5">
        {keys.slice(0, 5).map((k) => (
          <KeyButton 
            key={k} 
            label={k} 
            onClick={() => onAddDigit(k)} 
            isStruck={struckKeys.includes(k)}
            onToggleStruck={() => onToggleStruckKey(k)}
          />
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {keys.slice(5).map((k) => (
          <KeyButton 
            key={k} 
            label={k} 
            onClick={() => onAddDigit(k)} 
            isStruck={struckKeys.includes(k)}
            onToggleStruck={() => onToggleStruckKey(k)}
          />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5 mt-1">
        <button
          onClick={onRemoveDigit}
          onMouseDown={(e) => e.preventDefault()}
          className="col-span-2 h-10 sm:h-12 bg-[#cf6679] hover:bg-[#b15668] active:bg-[#934656] text-white font-bold rounded uppercase text-[10px] tracking-widest transition-all shadow-[0_0_15px_rgba(207,102,121,0.2)] active:scale-95"
        >
          DEL
        </button>
        <button
          onClick={onSubmitGuess}
          onMouseDown={(e) => e.preventDefault()}
          disabled={
            currentGuess.length !== codeLength ||
            !(status === "active" || status === "playing") ||
            isLoading ||
            timerActionBlocked
          }
          className={`
                        col-span-5 h-10 sm:h-12 font-bold rounded uppercase text-xs tracking-widest transition-all
                        ${
                          currentGuess.length === codeLength &&
                          (status === "active" || status === "playing") &&
                          !isLoading &&
                          !timerActionBlocked
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

function KeyButton({ 
  label, 
  onClick, 
  isStruck, 
  onToggleStruck 
}: { 
  label: string; 
  onClick: () => void;
  isStruck: boolean;
  onToggleStruck: () => void;
}) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [longPressTriggered, setLongPressTriggered] = useState(false);

  const startLongPress = () => {
    setLongPressTriggered(false);
    timerRef.current = setTimeout(() => {
        onToggleStruck();
        setLongPressTriggered(true);
    }, 600);
  };

  const endLongPress = () => {
    if (timerRef.current) {
        clearTimeout(timerRef.current);
    }
  };

  return (
    <button
      onClick={() => {
        if (!longPressTriggered) {
          onClick();
        }
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        startLongPress();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onToggleStruck();
      }}
      onTouchStart={startLongPress}
      onTouchEnd={endLongPress}
      onMouseUp={endLongPress}
      className={`
        relative h-10 sm:h-12 flex items-center justify-center font-bold font-mono text-lg rounded transition-all active:scale-90 select-none
        ${isStruck 
            ? "bg-[#3a3a3c]/20 text-[#565758] border border-[#3a3a3c]/30" 
            : "bg-[#3a3a3c] hover:bg-[#4a4a4c] text-slate-100 shadow-lg"}
      `}
    >
      {label}
      {isStruck && (
        <motion.div 
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
            <div className="w-full h-0.5 bg-red-500/50 rotate-45 absolute" />
            <div className="w-full h-0.5 bg-red-500/50 -rotate-45 absolute" />
        </motion.div>
      )}
    </button>
  );
}

export function AnimatedHeading({ text }: { text: string }) {
  return (
    <h1 className="text-[clamp(1.5rem,8vw,5rem)] font-bold tracking-widest font-serif flex justify-center flex-nowrap whitespace-nowrap overflow-visible pt-1 pb-1 gap-[0.05em] drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
      {text.split("").map((char, i) => (
        <motion.span
          key={i}
          whileHover={{
            scale: 1.1,
            color: "#538d4e",
            textShadow: "0 0 25px rgba(83,141,78,0.9)",
            y: -5,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 10 }}
          className="inline-block cursor-default select-none"
        >
          {char}
        </motion.span>
      ))}
    </h1>
  );
}

export function HowToPlayModal({ onClose }: { onClose: () => void }) {
  const sections = [
    { id: 'basics', label: '01_CORE_MECHANICS' },
    { id: 'modes', label: '02_MISSION_PROFILES' },
    { id: 'scoring', label: '03_OPERATIVE_ENTRY' },
    { id: 'multiplayer', label: '04_REMOTE_UPLINK' }
  ] as const;

  type SectionId = typeof sections[number]['id'];
  const [activeSection, setActiveSection] = useState<SectionId>('basics');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl cursor-pointer"
    >
      <motion.div
        initial={{ scale: 0.95, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0f0f10] border border-[#3a3a3c] rounded-2xl max-w-2xl w-full shadow-[0_0_60px_rgba(0,0,0,1)] border-t-[#565758]/50 flex flex-col max-h-[85dvh] cursor-default overflow-hidden"
      >
        {/* Terminal Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 border-b border-[#3a3a3c] shrink-0 bg-white/2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-[#538d4e] animate-pulse" />
            <h3 className="text-xl font-bold tracking-tighter font-serif uppercase text-slate-100">
                FIELD_MANUAL.pdf
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#565758] hover:text-white transition-all uppercase font-mono text-[10px] sm:text-xs bg-white/5 px-3 py-1.5 rounded border border-white/10 hover:border-white/20 flex items-center gap-2 group"
          >
            <span className="hidden sm:inline">[TERMINATE_SESSION]</span>
            <span className="sm:hidden">[X]</span>
            <div className="w-1.5 h-1.5 rounded-full bg-red-500/50 group-hover:bg-red-500 animate-ping" />
          </button>
        </div>

        {/* Sidebar Navigation */}
        <div className="flex flex-col sm:flex-row flex-1 min-h-0">
          <div className="w-full sm:w-48 border-b sm:border-b-0 sm:border-r border-[#3a3a3c] p-2 bg-black/20 overflow-x-auto sm:overflow-x-visible no-scrollbar">
            <div className="flex sm:flex-col gap-1 min-w-max sm:min-w-0">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`
                    flex-1 sm:flex-none text-left px-4 py-3 rounded-lg font-mono text-[9px] uppercase tracking-widest transition-all
                    ${activeSection === s.id 
                      ? "bg-[#538d4e]/10 text-[#538d4e] border-l-2 border-[#538d4e] shadow-[0_0_15px_rgba(83,141,78,0.1)]" 
                      : "text-[#565758] hover:text-slate-300 hover:bg-white/5"}
                  `}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">
            <AnimatePresence mode="wait">
              {activeSection === 'basics' && (
                <motion.div
                  key="basics"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <h4 className="text-[#538d4e] font-mono text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                        <span className="w-1 h-3 bg-[#538d4e] rounded-full" />
                        Mission_Objective
                    </h4>
                    <p className="text-slate-400 font-mono text-[11px] leading-relaxed uppercase">
                        Breach the system by decrypting the hidden numeric sequence using iterative trial and feedback analysis.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-slate-300 font-mono text-xs font-bold uppercase tracking-widest">Feedback_Protocols</h4>
                    <div className="space-y-3">
                        <div className="flex items-start gap-4 group">
                             <div className="w-6 h-6 rounded bg-[#6ca965] shrink-0 shadow-[0_0_10px_rgba(108,169,101,0.3)] flex items-center justify-center text-black font-bold text-xs">B</div>
                             <div className="flex flex-col">
                                <span className="text-[#6ca965] font-bold font-mono text-[11px] uppercase">[BULL] - Fixed_Point_Match</span>
                                <span className="text-slate-500 font-mono text-[10px] uppercase">A correct digit is placed in its <span className="text-[#6ca965] font-bold">exact target position</span>.</span>
                             </div>
                        </div>

                        <div className="flex items-start gap-4 group">
                             <div className="w-6 h-6 rounded bg-[#c8b653] shrink-0 shadow-[0_0_10px_rgba(200,182,83,0.3)] flex items-center justify-center text-black font-bold text-xs">C</div>
                             <div className="flex flex-col">
                                <span className="text-[#c8b653] font-bold font-mono text-[11px] uppercase">[COW] - Positional_Shift</span>
                                <span className="text-slate-500 font-mono text-[10px] uppercase">A correct digit exists in the code, but is in a <span className="text-[#c8b653] font-bold">different position</span>.</span>
                             </div>
                        </div>

                        <div className="flex items-start gap-4 group">
                             <div className="w-6 h-6 rounded bg-[#3a3a3c] shrink-0 flex items-center justify-center text-slate-500 font-bold text-xs">G</div>
                             <div className="flex flex-col">
                                <span className="text-slate-400 font-bold font-mono text-[11px] uppercase">[GRAY] - Data_Void</span>
                                <span className="text-slate-500 font-mono text-[10px] uppercase">Digit does not exist in the target sequence.</span>
                             </div>
                        </div>
                    </div>
                  </div>

                  <div className="relative p-4 bg-amber-900/10 border border-amber-500/20 rounded-xl overflow-hidden group">
                      <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-40 transition-opacity">
                        <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h5 className="text-amber-400 font-mono text-[11px] font-black uppercase mb-2 tracking-widest">SIGNAL_MAPPING_PROTOCOL:</h5>
                      <p className="text-amber-300 font-mono text-[10px] leading-relaxed uppercase pr-8">
                        Each feedback dot is <span className="underline decoration-amber-500 font-bold">permanently assigned</span> to a specific digit slot for the entire mission. The mapping is <span className="font-black italic">ENCODED</span> — operatives must analyze patterns across multiple guesses to calibrate the signal.
                      </p>
                  </div>
                </motion.div>
              )}

              {activeSection === 'modes' && (
                <motion.div
                  key="modes"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div className="space-y-4">
                    <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 text-[#538d4e]">
                            <span className="font-mono text-xs font-bold">[STANDARD_CIPHERS]</span>
                        </div>
                        <p className="text-slate-400 font-mono text-[10px] uppercase leading-relaxed">
                            Unique numeric sequences where no digit is repeated (e.g., 5-3-1-9). Ideal for classic logical deduction.
                        </p>
                    </div>

                    <div className="p-4 border border-[#c8b653]/30 bg-[#c8b653]/5 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 text-[#c8b653]">
                            <span className="font-mono text-xs font-bold">[ELITE_OVERDRIVE]</span>
                        </div>
                        <p className="text-slate-400 font-mono text-[10px] uppercase leading-relaxed">
                            Advanced anomalies allowing <span className="text-[#c8b653] font-bold underline">REPEATING DIGITS</span> (e.g., 7-7-2-7). exponentially harder to decrypt.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-blue-900/10 border border-blue-500/20 rounded-lg">
                             <div className="font-mono text-[10px] font-bold text-blue-400 mb-1">TIMER_LOCK</div>
                             <p className="text-[8px] text-slate-500 font-mono uppercase">Mission fails if the countdown reaches zero.</p>
                        </div>
                        <div className="p-3 bg-purple-900/10 border border-purple-500/20 rounded-lg">
                             <div className="font-mono text-[10px] font-bold text-purple-400 mb-1">UNLIMITED_TRIES</div>
                             <p className="text-[8px] text-slate-500 font-mono uppercase">Bypasses attempt limits for deep analysis sessions.</p>
                        </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeSection === 'scoring' && (
                <motion.div
                  key="scoring"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div className="space-y-4">
                    <h4 className="text-[#538d4e] font-mono text-xs font-bold uppercase tracking-widest">Operative_Efficiency_Rating</h4>
                    
                    <div className="space-y-4 font-mono text-[10px] uppercase">
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-slate-400">Mission Complexity Base</span>
                            <span className="text-slate-100 font-bold">500 - 10,000</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-slate-400">Efficiency Multiplier (Attempts)</span>
                            <span className="text-[#538d4e]">UP TO 2.0x</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-blue-400 font-bold">Timer Bonus</span>
                            <span className="text-blue-400">1.5x Multiplier</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2 text-red-400">
                            <span className="">Unlimited Tries Penalty</span>
                            <span className="">-30% Reduction</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-white/5 pb-2 text-red-400">
                            <span className="">Hint Utilization</span>
                            <span className="">-150 Per Request</span>
                        </div>
                    </div>

                    <div className="p-3 bg-white/5 rounded italic text-[9px] text-[#565758] font-mono uppercase">
                        * Solving on the first attempt yields maximum efficiency rewards.
                    </div>
                  </div>
                </motion.div>
              )}

              {activeSection === 'multiplayer' && (
                <motion.div
                  key="multiplayer"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <div className="space-y-4">
                    <h4 className="text-[#538d4e] font-mono text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                        <span className="w-1 h-3 bg-[#538d4e] rounded-full" />
                        Remote_Uplink_Protocol
                    </h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-2">
                            <span className="text-[#538d4e] font-mono text-[10px] font-bold uppercase">Target_Synchronization</span>
                            <p className="text-slate-500 font-mono text-[9px] uppercase leading-relaxed">
                                Both operatives are tasked with cracking the <span className="text-slate-200">SAME sequence</span> simultaneously. The first to achieve 100% decryption wins the session.
                            </p>
                        </div>
                        <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-2">
                            <span className="text-[#c8b653] font-mono text-[10px] font-bold uppercase">Static_Scramble_Protocol</span>
                            <p className="text-slate-500 font-mono text-[9px] uppercase leading-relaxed">
                                The feedback mapping is <span className="text-slate-200">IDENTICAL</span> for both players. Observe your opponent&apos;s progress to deduce the signal mapping faster.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h5 className="text-slate-300 font-mono text-[10px] font-black uppercase tracking-widest">Tactical_Tools</h5>
                        
                        <div className="flex items-start gap-4 p-3 border border-blue-500/20 bg-blue-500/5 rounded-lg">
                             <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs shrink-0">H</div>
                             <div className="flex flex-col">
                                <span className="text-blue-400 font-bold font-mono text-[10px] uppercase">Intel_Hints</span>
                                <span className="text-slate-500 font-mono text-[9px] uppercase leading-relaxed">
                                    Request a single digit reveal. Limited to <span className="text-blue-400 font-bold">50% of code length</span>. Each request incurs a <span className="text-red-400 font-bold">150 point penalty</span>.
                                </span>
                             </div>
                        </div>

                        <div className="flex items-start gap-4 p-3 border border-red-500/20 bg-red-500/5 rounded-lg">
                             <div className="w-8 h-8 rounded bg-red-500/20 flex items-center justify-center text-red-400 font-bold text-xs shrink-0">A</div>
                             <div className="flex flex-col">
                                <span className="text-red-400 font-bold font-mono text-[10px] uppercase">Abandonment_Protocol</span>
                                <span className="text-slate-500 font-mono text-[9px] uppercase leading-relaxed">
                                    Surrendering immediately awards the mission to your opponent. The remaining operative receives a <span className="text-[#538d4e] font-bold">500 point bonus</span> for system maintenance.
                                </span>
                             </div>
                        </div>
                    </div>

                    <div className="p-4 border border-purple-500/20 bg-purple-500/5 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                            <span className="text-purple-400 font-mono text-[10px] font-bold uppercase">Efficiency_Synchronization</span>
                        </div>
                        <p className="text-slate-500 font-mono text-[9px] uppercase leading-relaxed">
                            Multiplayer scoring utilizes the same <span className="text-slate-200 underline">Efficiency_Rating</span> as single-player field ops. Speed and precision are paramount.
                        </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#3a3a3c] shrink-0 bg-white/2 flex justify-center">
            <button
              onClick={onClose}
              className="px-12 py-3 bg-[#538d4e] hover:bg-[#58a352] text-black font-bold font-mono text-xs rounded transition-all active:scale-95 shadow-[0_0_20px_rgba(83,141,78,0.2)]"
            >
              CONFIRM_INTEL_RECEIVED
            </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function AbandonMissionModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-200 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl"
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-[#0f0f10] border border-red-500/20 p-8 rounded-2xl max-w-sm w-full shadow-[0_0_50px_rgba(239,68,68,0.1)] border-t-red-500/30 text-center space-y-8"
            >
                <div className="space-y-4">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
                        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-xl font-bold tracking-tighter font-serif uppercase text-red-500">
                            DESERTION_DETECTED
                        </h3>
                        <p className="text-[#565758] font-mono text-[10px] uppercase leading-relaxed tracking-wider">
                            Mission desertion will result in immediate failure. Confirm resignation?
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <button
                        onClick={onConfirm}
                        className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold font-mono text-xs rounded transition-all active:scale-95 shadow-[0_0_20px_rgba(220,38,38,0.2)] uppercase"
                    >
                        CONFIRM_RESIGNATION
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full py-3 border border-[#538d4e]/30 bg-[#538d4e]/5 hover:bg-[#538d4e]/10 text-[#538d4e] font-bold font-mono text-xs rounded transition-all active:scale-95"
                    >
                        [RETURN_TO_STATION]
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
