"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

export default function MultiplayerLanding() {
  const router = useRouter();
  const [selectedLevel, setSelectedLevel] = useState(0);
  const [category, setCategory] = useState<"standard" | "overdrive">(
    "standard",
  );
  const [allowRepeats, setAllowRepeats] = useState(false);

  interface MissionLevel {
    label: string;
    length: number;
    tries: number;
    repeats: boolean;
    desc: string;
  }

  const MISSION_LEVELS: Record<string, MissionLevel[]> = {
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

  const generateRoom = () => {
    const roomId = uuidv4().slice(0, 8);
    // Encode level params in URL or use room state on backend
    // For Phase 1, we just want to see the overview.
    router.push(
      `/multiplayer/${roomId}?mode=${category}&level=${MISSION_LEVELS[category][selectedLevel].length}&repeats=${category === "overdrive" ? "true" : allowRepeats}`,
    );
  };

  return (
    <main className="relative flex h-dvh w-full flex-col bg-[#0a0a0b] text-slate-100 overflow-hidden selection:bg-[#538d4e]/30 p-6 sm:p-10">
      <BinaryBackground />

      <header className="w-full h-20 flex items-center justify-between z-50 shrink-0">
        <div className="w-10" /> {/* Spacer to maintain layout balance */}
      </header>

      <div className="flex-1 w-full flex flex-col items-center justify-center relative z-10 max-w-sm mx-auto gap-8">
        <div className="text-center space-y-3">
          <AnimatedHeading text="CODEBREAKER" />
          <h1 className="text-2xl font-bold tracking-[0.5em] font-serif flex justify-center flex-nowrap whitespace-nowrap overflow-hidden opacity-80">
            MULTIPLAYER
          </h1>
          <p className="text-[#538d4e] font-mono text-[8px] uppercase tracking-[0.6em] animate-pulse">
            ESTABLISHING_ENCRYPTED_UPLINK...
          </p>
        </div>

        <div className="w-full space-y-4">
          <div className="flex gap-2 p-1 bg-white/5 border border-white/10 rounded-lg relative overflow-hidden">
            <button
              onClick={() => {
                setCategory("standard");
                setSelectedLevel(0);
              }}
              className={`relative flex-1 py-2 font-mono text-[10px] rounded transition-colors z-10 ${category === "standard" ? "text-black font-bold" : "text-[#565758] hover:text-slate-300"}`}
            >
              {category === "standard" && (
                <motion.div
                  layoutId="active-pill"
                  className="absolute inset-0 bg-[#538d4e] rounded shadow-[0_0_15px_rgba(83,141,78,0.3)]"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">STANDARD</span>
            </button>
            <button
              onClick={() => {
                setCategory("overdrive");
                setSelectedLevel(0);
              }}
              className={`relative flex-1 py-2 font-mono text-[10px] rounded transition-colors z-10 ${category === "overdrive" ? "text-black font-bold" : "text-[#565758] hover:text-slate-300"}`}
            >
              {category === "overdrive" && (
                <motion.div
                  layoutId="active-pill"
                  className="absolute inset-0 bg-[#538d4e] rounded shadow-[0_0_15px_rgba(83,141,78,0.3)]"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">OVERDRIVE</span>
            </button>
          </div>

          <AnimatePresence>
            {category === "standard" && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <button
                  onClick={() => setAllowRepeats(!allowRepeats)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-all group"
                >
                  <div className="flex flex-col text-left">
                    <span className="font-mono text-[10px] font-bold text-slate-300 group-hover:text-[#538d4e] transition-colors">REPEAT_DIGITS</span>
                    <span className="font-mono text-[8px] text-[#565758] uppercase">Allow multiple instances of same digit</span>
                  </div>
                  <div className={`w-10 h-5 rounded-full relative transition-colors ${allowRepeats ? "bg-[#538d4e]" : "bg-[#3a3a3c]"}`}>
                    <motion.div 
                      animate={{ x: allowRepeats ? 22 : 2 }}
                      className="absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm"
                    />
                  </div>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col gap-2 min-h-40 max-h-[30dvh] overflow-y-auto pr-1 custom-scrollbar">
            <AnimatePresence mode="wait">
              <motion.div
                key={category}
                initial={{ opacity: 0, x: category === "standard" ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: category === "standard" ? 10 : -10 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="flex flex-col gap-2 w-full"
              >
                {MISSION_LEVELS[category].map((level, i) => (
                  <button
                    key={level.label}
                    onClick={() => setSelectedLevel(i)}
                    className={`
                      group relative p-4 rounded-lg border-2 transition-all flex items-center justify-between text-left
                      ${selectedLevel === i ? "border-[#6ca965] bg-[#6ca965]/5 shadow-[0_0_20px_rgba(108,169,101,0.1)]" : "border-[#3a3a3c] hover:border-[#565758]"}
                    `}
                  >
                    <div className="flex flex-col">
                      <span
                        className={`font-mono text-sm font-bold ${selectedLevel === i ? "text-[#538d4e]" : "text-slate-300"}`}
                      >
                        {level.label}
                      </span>
                      <span className="text-[#565758] font-mono text-[9px] uppercase">
                        {`${level.desc} // ${level.length}D`}
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
              </motion.div>
            </AnimatePresence>
          </div>

          <button
            onClick={generateRoom}
            className="w-full py-4 bg-[#538d4e] hover:bg-[#58a352] text-black text-lg font-bold rounded-lg transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(83,141,78,0.2)]"
          >
            CREATE_ROOM
          </button>

          <button
            onClick={() => router.push("/")}
            className="w-full py-3 bg-[#cf6679] hover:bg-[#b15668] text-white font-mono text-xs font-bold rounded-lg transition-all active:scale-95 shadow-[0_0_15px_rgba(207,102,121,0.2)]"
          >
            EXIT_TO_ROOT
          </button>
        </div>
      </div>

      <footer className="mt-auto text-[#565758] font-mono text-[8px] uppercase tracking-[0.4em] text-center">
        {`© 2026 CODEBREAKER // SECURE_UPLINK_v1.0`}
      </footer>
    </main>
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

function AnimatedHeading({ text }: { text: string }) {
  return (
    <h1 className="text-4xl sm:text-5xl font-bold tracking-widest font-serif flex justify-center flex-nowrap whitespace-nowrap overflow-hidden py-2">
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
