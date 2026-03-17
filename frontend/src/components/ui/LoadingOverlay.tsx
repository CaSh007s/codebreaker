"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const RAW_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000";
const BACKEND_URL = RAW_URL.replace(/\/$/, ""); // Strip trailing slash

const BOOT_LOGS = [
  "INITIATING TACTICAL HANDSHAKE...",
  "ESTABLISHING ENCRYPTED TUNNEL...",
  "SYNCHRONIZING NEURAL BUFFERS...",
  "AUDITING CRYPTO_CORES...",
  "VERIFYING UPLINK AUTHENTICITY...",
  "CALIBRATING SIGNAL NOISE...",
  "DEPLOYING FIELD AGENTS...",
  "SECURING SIGNAL STRENGTH...",
  "MAPPING GEOSPATIAL COORDINATES...",
  "UPLINK_STABLE // READY_FOR_DEPLOYMENT"
];

export default function LoadingOverlay() {
  const [logs, setLogs] = useState<string[]>([]);
  const [show, setShow] = useState(false);
  const [complete, setComplete] = useState(false);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-4), `>> [SYSTEM]: ${msg}`]);
  }, []);

  useEffect(() => {
    // Only show if backend hasn't been woken in this session
    if (sessionStorage.getItem("cb_backend_woken")) {
      return;
    }
    setShow(true);

    let logIndex = 0;
    const logInterval = setInterval(() => {
      if (logIndex < BOOT_LOGS.length && !complete) {
        addLog(BOOT_LOGS[logIndex]);
        logIndex++;
      }
    }, 1200);

    const checkHealth = async () => {
      if (complete) return;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const res = await fetch(`${BACKEND_URL}/health`, { 
            signal: controller.signal,
            mode: 'cors' 
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          setComplete(true);
          sessionStorage.setItem("cb_backend_woken", "true");
          addLog("HANDSHAKE COMPLETE. WELCOME OPERATIVE.");
          clearInterval(logInterval);
          // If was already up, disappear faster
          setTimeout(() => setShow(false), logIndex === 0 ? 500 : 1500);
        }
      } catch (err) {
        console.warn("Handshake pending...", err);
      }
    };

    const healthInterval = setInterval(checkHealth, 3000);
    checkHealth();

    return () => {
      clearInterval(logInterval);
      clearInterval(healthInterval);
    };
  }, [complete, addLog]);

  if (!show) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="overlay"
        initial={{ opacity: 1 }}
        exit={{ 
          opacity: 0, 
          scale: 1.05,
          filter: "blur(20px) contrast(1.2)",
          transition: { duration: 0.8, ease: "circIn" }
        }}
        className="fixed inset-0 z-9999 bg-[#0a0a0b] flex flex-col items-center justify-center overflow-hidden"
      >
        {/* Background Grid */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#538d4e_1px,transparent_1px)] bg-size-[24px_24px]" />
        
        {/* Viewport Corners */}
        <div className="absolute top-8 left-8 w-12 h-12 border-t-2 border-l-2 border-[#538d4e]/20" />
        <div className="absolute top-8 right-8 w-12 h-12 border-t-2 border-r-2 border-[#538d4e]/20" />
        <div className="absolute bottom-8 left-8 w-12 h-12 border-b-2 border-l-2 border-[#538d4e]/20" />
        <div className="absolute bottom-8 right-8 w-12 h-12 border-b-2 border-r-2 border-[#538d4e]/20" />

        {/* Central UI */}
        <div className="relative w-80 h-80 flex items-center justify-center scale-90 sm:scale-100">
            {/* Pulsing Glow */}
            <motion.div
                animate={{ 
                    opacity: [0.1, 0.2, 0.1],
                    scale: [1, 1.2, 1]
                }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute inset-0 bg-[#538d4e] rounded-full blur-[80px]"
            />

            {/* Rotating Rings */}
            {[0, 1, 2].map((i) => (
                <motion.div
                    key={i}
                    animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
                    transition={{ 
                        duration: 8 + i * 4, 
                        repeat: Infinity, 
                        ease: "linear" 
                    }}
                    className={`absolute rounded-full border border-[#538d4e]/${10 + i * 10}`}
                    style={{
                        inset: `${i * 24}px`,
                        borderStyle: i === 1 ? 'dashed' : 'solid'
                    }}
                />
            ))}

            {/* Scanning Radar Bar */}
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-linear-to-t from-transparent via-[#538d4e]/5 to-transparent rounded-full"
            />
            
            {/* Center Core */}
            <div className="relative flex flex-col items-center">
                <motion.div
                    animate={{ 
                        opacity: [0.4, 1, 0.4],
                        scale: [0.98, 1.02, 0.98]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="flex flex-col items-center"
                >
                    <span className="text-[#538d4e] font-mono text-4xl font-black -tracking-widest drop-shadow-[0_0_15px_rgba(83,141,78,0.5)]">
                        CODEBREAKER
                    </span>
                   
                    <div className="flex items-center gap-2 mt-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${complete ? 'bg-[#538d4e] shadow-[0_0_8px_#538d4e]' : 'bg-red-500 animate-pulse'}`} />
                        <span className="text-[10px] font-mono text-white/40 tracking-[0.4em] uppercase font-bold">
                            {complete ? "UPLINK_SECURED" : "HANDSHAKE_PENDING"}
                        </span>
                    </div>

                    {/* Integrated Progress Bar */}
                    <div className="w-48 h-0.5 bg-[#538d4e]/10 rounded-full mt-6 overflow-hidden">
                        <motion.div 
                            initial={{ width: "0%" }}
                            animate={{ width: complete ? "100%" : "70%" }}
                            transition={{ 
                                duration: complete ? 1 : 20, 
                                ease: complete ? "easeOut" : "linear" 
                            }}
                            className="h-full bg-[#538d4e] shadow-[0_0_15px_#538d4e]"
                        />
                    </div>
                </motion.div>
            </div>
        </div>


        {/* Tactical Console Logs */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-[90%] max-w-md h-24 flex flex-col justify-end">
            <div className="space-y-1.5">
                <AnimatePresence initial={false}>
                    {logs.map((log, i) => (
                        <motion.div
                            key={log + i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="font-mono text-[9px] sm:text-[10px] text-[#538d4e]/60 flex items-start gap-2"
                        >
                            <span className="shrink-0 opacity-50">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                            <span className="truncate">{log}</span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>

        {/* Vertical HUD markings */}
        <div className="absolute inset-y-0 left-8 hidden sm:flex flex-col justify-between py-12 opacity-20 pointer-events-none">
             {[...Array(10)].map((_, i) => (
                 <div key={i} className="w-4 h-px bg-[#538d4e]" />
             ))}
        </div>
        <div className="absolute inset-y-0 right-8 hidden sm:flex flex-col justify-between py-12 opacity-20 pointer-events-none">
             {[...Array(10)].map((_, i) => (
                 <div key={i} className="w-1 h-1 bg-[#538d4e] rounded-full" />
             ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
