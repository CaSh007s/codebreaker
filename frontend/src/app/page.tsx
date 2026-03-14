"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRef, useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";

export default function Home() {
  const { startNewGame, isLoading, gameId, status, error, attemptsRemaining } = useGameStore();

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
    <main className="flex h-screen w-full flex-col items-center bg-[#121213] text-slate-100 overflow-hidden py-4 px-2 sm:py-8">
      <div className="flex-none w-full max-w-md flex flex-col items-center mb-4 sm:mb-8">
        <motion.header 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
        >
          <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl font-serif mb-1">
            CODEBREAKER
          </h1>
          <p className="text-[#565758] font-mono text-[8px] uppercase tracking-[0.3em] mb-4">
              LOGIC_RECON_v1.0
          </p>
          <div className="flex items-center justify-center gap-4">
            <div className={`flex flex-col items-center px-4 py-1 border border-[#3a3a3c] rounded-md transition-colors ${attemptsRemaining !== null && attemptsRemaining <= 5 ? 'border-red-500/50 bg-red-500/5' : ''}`}>
                <span className="text-[#565758] font-mono text-[8px] uppercase tracking-widest">Attempts Rem.</span>
                <span className={`text-xl font-bold font-mono ${attemptsRemaining !== null && attemptsRemaining <= 5 ? 'text-red-400' : 'text-slate-100'}`}>
                    {attemptsRemaining ?? '∞'}
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
            {status !== 'active' && (
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="absolute inset-0 flex items-center justify-center bg-[#121213]/80 backdrop-blur-sm z-50 p-6"
                >
                    <div className="bg-[#121213] border border-[#3a3a3c] p-8 rounded-xl shadow-2xl text-center max-w-xs w-full">
                        <h2 className={`text-2xl font-bold mb-6 tracking-tight ${status === 'solved' ? 'text-[#6ca965]' : 'text-[#787c7f]'}`}>
                            {status === 'solved' ? 'SYSTEM CRACKED' : 'ACCESS DENIED'}
                        </h2>
                        <button 
                            onClick={() => startNewGame()}
                            className="w-full py-3 bg-[#6ca965] hover:bg-[#5a8d54] text-white font-bold rounded transition-all active:scale-95"
                        >
                            NEW SESSION
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        <Keyboard />
      </div>

      <footer className="flex-none mt-4 text-[#565758] font-mono text-[8px] uppercase tracking-[0.4em]">
        &copy; 2026 CODEBREAKER // LOGIC_RECON
      </footer>
    </main>
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
                behavior: 'smooth'
            });
        }
    }, [guesses.length]);

    // Render all existing guesses + 1 active row if game is active
    const totalRows = status === 'active' ? guesses.length + 1 : guesses.length;
    // Always show at least some empty rows for aesthetic if board is empty
    const displayRows = Math.max(totalRows, 6);
    const rows = Array.from({ length: displayRows });

    return (
        <div 
            ref={scrollRef}
            className="flex flex-col gap-1.5 w-full overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#3a3a3c] scrollbar-track-transparent custom-scrollbar"
            style={{ maxHeight: '100%' }}
        >
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
            className={`flex items-center gap-3 w-full p-1 rounded-lg transition-colors ${isActive ? 'bg-[#3a3a3c]/10 border border-[#3a3a3c]/30' : 'border border-transparent'}`}
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
                w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-xl sm:text-2xl font-mono font-bold border-2 transition-all duration-200 rounded
                ${digit ? 'border-[#565758] bg-[#121213] text-white' : 'border-[#3a3a3c] bg-[#121213] text-[#3a3a3c]'}
                ${isActive ? 'border-[#818384]' : ''}
                ${isCompleted ? 'border-[#3a3a3c] opacity-100' : ''}
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
                        w-2.5 h-2.5 rounded-full border
                        ${type === 'bull' ? 'bg-[#6ca965] border-[#6ca965]' : ''}
                        ${type === 'cow' ? 'bg-[#c8b653] border-[#c8b653]' : ''}
                        ${type === 'gray' ? 'bg-[#787c7f] border-[#787c7f]' : ''}
                        ${type === 'hollow' ? 'bg-transparent border-[#3a3a3c]' : ''}
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
        <div className="w-full max-w-sm flex flex-col gap-1.5 mt-auto pb-4">
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
                    className="col-span-2 h-10 sm:h-12 bg-[#22c55e] hover:bg-[#16a34a] active:bg-[#15803d] text-white font-bold rounded uppercase text-[10px] tracking-widest transition-colors shadow-lg shadow-green-900/20"
                >
                    DEL
                </button>
                <button 
                    onClick={submitGuess}
                    disabled={currentGuess.length !== codeLength || status !== 'active' || isLoading}
                    className={`
                        col-span-5 h-10 sm:h-12 font-bold rounded uppercase text-xs tracking-widest transition-all
                        ${currentGuess.length === codeLength && status === 'active' && !isLoading
                            ? 'bg-[#166534] hover:bg-[#14532d] text-white cursor-pointer shadow-lg shadow-green-900/30' 
                            : 'bg-[#565758] text-[#818384] cursor-not-allowed'}
                        ${isLoading ? 'animate-pulse' : ''}
                    `}
                >
                    {isLoading ? 'PROCESSING...' : 'SUBMIT'}
                </button>
            </div>
        </div>
    );
}

function KeyButton({ label, onClick }: { label: string, onClick: () => void }) {
    return (
        <button 
            onClick={onClick}
            className="h-10 sm:h-12 bg-[#818384] hover:bg-[#707273] active:bg-[#565758] text-white text-lg font-bold rounded transition-all flex items-center justify-center"
        >
            {label}
        </button>
    );
}
