"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { useRouter } from "next/navigation";
import LoadingOverlay from "@/components/ui/LoadingOverlay";
import { api } from "@/lib/api";
import { useGameStore } from "@/store/useGameStore";

const PREFIXES = ["VOID", "CYPHER", "LOGIC", "GHOST", "SIGNAL", "NEON", "QUANTUM", "PHANTOM", "NEXUS", "STATIC"];
const SUFFIXES = ["WALKER", "BLADE", "PULSE", "BREAKER", "HUNTER", "RAVEN", "ECHO", "FLUX", "TRACE", "SCOUT"];

function randomCallsign() {
  const random = () => {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    return Math.random();
  };
  return `${PREFIXES[Math.floor(random() * PREFIXES.length)]}_${SUFFIXES[Math.floor(random() * SUFFIXES.length)]}_${Math.floor(random() * 900) + 100}`;
}

export default function EntryPage() {
  const router = useRouter();
  const setUsername = useGameStore((state) => state.setUsername);
  const [mode, setMode] = useState<"guest" | "login" | "register">("guest");
  const [callsign, setCallsign] = useState(() => randomCallsign());
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enterGuest = () => {
    const normalized = callsign.trim().replace(/\s+/g, "_").toUpperCase();
    if (normalized.length < 2) {
      setError("CALLSIGN_MUST_BE_AT_LEAST_2_CHARACTERS");
      return;
    }
    setUsername(normalized);
    sessionStorage.setItem("codebreaker_entry_access", "guest");
    router.push("/play");
  };

  const submitAccount = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = mode === "register"
        ? await api.register(callsign.trim(), password)
        : await api.login(callsign.trim(), password);
      setUsername(result.user.username);
      sessionStorage.setItem("codebreaker_entry_access", "account");
      window.dispatchEvent(new Event("codebreaker-auth-changed"));
      router.push("/play");
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[#0a0a0b] px-4 py-8 text-slate-100 selection:bg-[#538d4e]/30">
      <LoadingOverlay />
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(83,141,78,0.09),transparent_48%)]" />
      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 flex w-full max-w-md flex-col items-center gap-7 text-center">
        <div>
          <h1 className="text-4xl font-bold tracking-[0.18em] font-serif sm:text-5xl">CODEBREAKER</h1>
          <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.45em] text-[#538d4e]">ESTABLISH_YOUR_IDENTITY</p>
        </div>

        {mode === "guest" ? (
          <div className="w-full space-y-4 rounded-2xl border border-[#3a3a3c] bg-black/30 p-5 text-left shadow-[0_0_40px_rgba(0,0,0,0.35)]">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-slate-100">PLAY_AS_GUEST</p>
              <p className="mt-2 font-mono text-[9px] uppercase leading-relaxed text-[#565758]">Choose a callsign and enter instantly. Single-player remains available offline.</p>
            </div>
            <div className="flex gap-2">
              <input value={callsign} maxLength={24} onChange={(event) => { setCallsign(event.target.value); setError(null); }} onKeyDown={(event) => { if (event.key === "Enter") enterGuest(); }} className="min-w-0 flex-1 rounded-lg border border-[#3a3a3c] bg-black/30 px-3 py-3 font-mono text-xs uppercase text-slate-100 outline-none focus:border-[#538d4e]" aria-label="Guest callsign" />
              <button type="button" onClick={() => setCallsign(randomCallsign())} className="rounded-lg border border-[#3a3a3c] px-3 font-mono text-[9px] uppercase text-[#565758] hover:border-[#538d4e] hover:text-[#538d4e]">NEW</button>
            </div>
            <button type="button" onClick={enterGuest} className="w-full rounded-lg bg-[#538d4e] py-4 font-mono text-xs font-bold uppercase tracking-widest text-black shadow-[0_0_20px_rgba(83,141,78,0.2)] transition-all hover:bg-[#58a352] active:scale-[0.98]">ENTER_AS_GUEST</button>
            <div className="grid grid-cols-2 gap-3 border-t border-[#3a3a3c] pt-4">
              <button type="button" onClick={() => { setMode("login"); setError(null); }} className="rounded-lg border border-[#3a3a3c] py-3 font-mono text-[10px] uppercase text-slate-300 hover:border-[#538d4e] hover:text-[#538d4e]">LOGIN</button>
              <button type="button" onClick={() => { setMode("register"); setError(null); }} className="rounded-lg border border-[#538d4e]/40 py-3 font-mono text-[10px] uppercase text-[#538d4e] hover:bg-[#538d4e]/10">SIGN_UP</button>
            </div>
          </div>
        ) : (
          <div className="w-full space-y-4 rounded-2xl border border-[#3a3a3c] bg-black/30 p-5 text-left shadow-[0_0_40px_rgba(0,0,0,0.35)]">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-slate-100">{mode === "login" ? "ACCOUNT_LOGIN" : "CREATE_ACCOUNT"}</p>
              <p className="mt-2 font-mono text-[9px] uppercase leading-relaxed text-[#565758]">{mode === "login" ? "Restore your callsign, friends, and notifications." : "Create a persistent callsign with an 8-character minimum password."}</p>
            </div>
            <input value={callsign} maxLength={24} onChange={(event) => { setCallsign(event.target.value); setError(null); }} placeholder="CALLSIGN" aria-label="Account callsign" className="w-full rounded-lg border border-[#3a3a3c] bg-black/30 px-3 py-3 font-mono text-xs uppercase text-slate-100 outline-none focus:border-[#538d4e]" />
            <input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(null); }} onKeyDown={(event) => { if (event.key === "Enter") void submitAccount(); }} placeholder="PASSWORD" aria-label="Account password" className="w-full rounded-lg border border-[#3a3a3c] bg-black/30 px-3 py-3 font-mono text-xs text-slate-100 outline-none focus:border-[#538d4e]" />
            {error && <p role="alert" className="font-mono text-[9px] uppercase text-red-400">{error}</p>}
            <button type="button" disabled={busy} onClick={() => void submitAccount()} className="w-full rounded-lg bg-[#538d4e] py-4 font-mono text-xs font-bold uppercase tracking-widest text-black transition-all hover:bg-[#58a352] disabled:opacity-50">{busy ? "CONNECTING..." : mode === "login" ? "LOGIN" : "CREATE_ACCOUNT"}</button>
            <button type="button" onClick={() => { setMode("guest"); setPassword(""); setError(null); }} className="w-full rounded-lg border border-[#3a3a3c] py-3 font-mono text-[10px] uppercase text-[#565758] hover:border-[#538d4e] hover:text-[#538d4e]">BACK_TO_GUEST</button>
          </div>
        )}

        {mode === "guest" && error && <p role="alert" className="font-mono text-[9px] uppercase text-red-400">{error}</p>}
        <p className="font-mono text-[8px] uppercase tracking-[0.35em] text-[#565758]">© 2026 CODEBREAKER</p>
      </motion.section>
    </main>
  );
}
