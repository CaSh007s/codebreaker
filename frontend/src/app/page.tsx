"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";

export default function Home() {
  const { startNewGame, isLoading, gameId, status, error } = useGameStore();

  useEffect(() => {
    if (!gameId) {
      startNewGame();
    }
  }, [gameId, startNewGame]);

  if (isLoading && !gameId) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-50 font-mono">
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="text-2xl tracking-[0.2em]"
        >
            INITIALIZING_SYSTEM...
        </motion.div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 bg-slate-950 sm:p-24 overflow-hidden selection:bg-indigo-500/30">
      <div className="z-10 w-full max-w-md flex flex-col items-center gap-6">
        <motion.header 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-center"
        >
          <h1 className="text-5xl font-bold tracking-tighter sm:text-7xl font-serif text-slate-100 mb-2 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
            CODEBREAKER
          </h1>
          <div className="flex items-center justify-center gap-2">
            <span className="h-px w-8 bg-slate-800" />
            <p className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em]">
                LOGIC_RECON_v1.0
            </p>
            <span className="h-px w-8 bg-slate-800" />
          </div>
        </motion.header>

        <div className="w-full grow flex flex-col gap-2">
            <Board />
        </div>

        <AnimatePresence>
            {error && (
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-red-400 font-mono text-xs uppercase bg-red-400/10 border border-red-400/20 px-4 py-2 rounded-full"
                >
                    ERROR: {error}
                </motion.div>
            )}
        </AnimatePresence>

        <AnimatePresence>
            {status !== 'active' && (
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center p-6 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl shadow-2xl z-20"
                >
                    <h2 className={`text-3xl font-bold mb-4 tracking-tight ${status === 'solved' ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {status === 'solved' ? 'SYSTEM CRACKED' : 'ACCESS DENIED'}
                    </h2>
                    <button 
                        onClick={() => startNewGame()}
                        className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-indigo-600/20"
                    >
                        NEW SESSION
                    </button>
                </motion.div>
            )}
        </AnimatePresence>

        <Keyboard />
      </div>

      <footer className="mt-8 text-slate-700 font-mono text-[9px] uppercase tracking-[0.4em] opacity-50">
        &copy; 2026 ANTIGRAVITY_LABS // SHADOW_ARCH
      </footer>
    </main>
  );
}

function Board() {
    const { guesses, currentGuess, codeLength, status } = useGameStore();
    
    const maxRows = 8;
    const rows = Array.from({ length: maxRows });

    return (
        <div className="flex flex-col gap-2 w-full">
            {rows.map((_, i) => {
                const guessObj = guesses[i];
                const isCurrent = i === guesses.length && status === 'active';
                const content = guessObj ? guessObj.guess : (isCurrent ? currentGuess : "");
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

function GuessRow({ content, codeLength, feedback, isActive, isCompleted }: { content: string, codeLength: number, feedback: string[], isActive: boolean, isCompleted: boolean }) {
    const digits = content.split("");
    const placeholders = Array.from({ length: codeLength });

    return (
        <motion.div 
            layout
            className={`flex items-center gap-4 w-full p-1.5 rounded-xl transition-colors ${isActive ? 'bg-indigo-500/5 border border-indigo-500/10' : 'border border-transparent'}`}
        >
            <div className="flex gap-2.5 grow justify-center">
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
            <div className="flex flex-wrap gap-1.5 w-14 justify-center">
                <FeedbackDots feedback={feedback} />
            </div>
        </motion.div>
    );
}

function DigitTile({ digit, isActive, isCompleted, delay }: { digit: string, isActive: boolean, isCompleted: boolean, delay: number }) {
    return (
        <motion.div 
            initial={isCompleted ? { rotateX: 0 } : false}
            animate={isCompleted ? { rotateX: [0, 90, 0] } : {}}
            transition={{ duration: 0.5, delay }}
            className={`
                w-12 h-14 sm:w-16 sm:h-20 flex items-center justify-center text-3xl sm:text-4xl font-mono font-bold border-2 transition-all duration-200 rounded-lg
                ${digit ? 'border-slate-500 bg-slate-900 text-slate-100 shadow-inner' : 'border-slate-800/50 bg-slate-950 text-slate-800'}
                ${isActive ? 'border-indigo-500/50 ring-4 ring-indigo-500/10' : ''}
                ${isCompleted ? 'border-slate-700 bg-slate-900/40 opacity-80' : ''}
            `}
        >
            {digit}
        </motion.div>
    );
}

function FeedbackDots({ feedback }: { feedback: string[] }) {
    const dots = [...feedback];
    while (dots.length < 4) {
        dots.push("hollow");
    }

    return (
        <div className="grid grid-cols-2 gap-1.5">
            {dots.map((type, i) => (
                <motion.div 
                    key={i} 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.1 + 0.5, type: "spring", stiffness: 300 }}
                    className={`
                        w-3 h-3 rounded-full border
                        ${type === 'bull' ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.4)]' : ''}
                        ${type === 'cow' ? 'bg-amber-400 border-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.4)]' : ''}
                        ${type === 'gray' ? 'bg-slate-700 border-slate-600' : ''}
                        ${type === 'hollow' ? 'bg-transparent border-slate-800/50' : ''}
                    `}
                />
            ))}
        </div>
    );
}

function Keyboard() {
    const { addDigit, removeDigit, submitGuess, currentGuess, codeLength, status, isLoading } = useGameStore();

    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (status !== 'active') return;
            if (e.key >= '0' && e.key <= '9') addDigit(e.key);
            if (e.key === 'Backspace') removeDigit();
            if (e.key === 'Enter') submitGuess();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [addDigit, removeDigit, submitGuess, status]);

    return (
        <div className="w-full max-w-sm flex flex-col gap-2 mt-auto">
            <div className="grid grid-cols-5 gap-1.5">
                {keys.slice(0, 5).map(k => (
                    <KeyButton key={k} label={k} onClick={() => addDigit(k)} />
                ))}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
                {keys.slice(5).map(k => (
                    <KeyButton key={k} label={k} onClick={() => addDigit(k)} />
                ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5 mt-1">
                <button 
                    onClick={removeDigit}
                    className="col-span-2 h-12 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 font-mono font-bold rounded uppercase text-xs tracking-tighter transition-colors"
                >
                    DEL
                </button>
                <button 
                    onClick={submitGuess}
                    disabled={currentGuess.length !== codeLength || status !== 'active' || isLoading}
                    className={`
                        col-span-5 h-12 font-mono font-bold rounded uppercase text-sm tracking-widest transition-all
                        ${currentGuess.length === codeLength && status === 'active' && !isLoading
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] cursor-pointer' 
                            : 'bg-slate-900 text-slate-700 cursor-not-allowed border border-slate-800'}
                        ${isLoading ? 'animate-pulse' : ''}
                    `}
                >
                    {isLoading ? 'PROCESSING...' : 'SUBMIT_GUESS'}
                </button>
            </div>
        </div>
    );
}

function KeyButton({ label, onClick }: { label: string, onClick: () => void }) {
    return (
        <button 
            onClick={onClick}
            className="h-12 sm:h-14 bg-slate-900 border-b-2 border-slate-950 hover:bg-slate-800 active:translate-y-0.5 active:border-b-0 text-slate-200 text-xl font-mono font-bold rounded transition-all flex items-center justify-center"
        >
            {label}
        </button>
    );
}
