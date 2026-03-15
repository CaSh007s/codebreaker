"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export default function RoomFull() {
  const router = useRouter();

  return (
    <main className="relative flex h-dvh w-full flex-col bg-[#0a0a0b] text-slate-100 items-center justify-center p-6 sm:p-10">
      <BinaryBackground />
      <div className="z-10 w-full max-w-sm space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-widest font-serif text-[#cf6679]">ACCESS_DENIED</h1>
          <h2 className="text-xl font-bold tracking-[0.2em] font-serif uppercase opacity-80">ROOM_CAPACITY_REACHED</h2>
          <p className="text-[#565758] font-mono text-[11px] uppercase tracking-widest leading-relaxed">
            The encrypted channel is already occupied by two entities. Multiple uplinks are not permitted at this frequency.
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => router.push("/multiplayer")}
            className="w-full py-4 bg-[#538d4e] hover:bg-[#58a352] text-black text-lg font-bold rounded-xl transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(83,141,78,0.2)] uppercase"
          >
            NEW_UPLINK
          </button>

          <button
            onClick={() => router.push("/")}
            className="w-full py-3 bg-white/5 hover:bg-white/10 text-slate-300 font-mono text-xs font-bold rounded-lg border border-[#3a3a3c] transition-all active:scale-95 uppercase"
          >
            RETURN_TO_BASE
          </button>
        </div>
      </div>

      <footer className="mt-auto text-[#565758] font-mono text-[8px] uppercase tracking-[0.4em] text-center">
        {`© 2026 CODEBREAKER // SECURITY_PROTOCOL_v4.2`}
      </footer>
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
    <div className="absolute inset-0 overflow-hidden opacity-[0.03] pointer-events-none select-none font-mono text-[10px] flex flex-wrap gap-4 leading-none text-red-500/50">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.1, 0.5, 0.1] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay }}
        >
          {p.value}
        </motion.span>
      ))}
    </div>
  );
}
