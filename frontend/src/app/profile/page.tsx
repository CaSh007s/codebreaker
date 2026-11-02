"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UserCircle } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (sessionStorage.getItem("codebreaker_entry_access")) setReady(true);
      else router.replace("/");
    });
    return () => cancelAnimationFrame(frame);
  }, [router]);

  if (!ready) return null;

  return (
    <main className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[#0a0a0b] px-4 py-8 text-slate-100">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(83,141,78,0.08),transparent_48%)]" />
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 flex w-full max-w-md flex-col items-center rounded-2xl border border-[#3a3a3c] bg-black/30 p-8 text-center shadow-[0_0_45px_rgba(0,0,0,0.45)]"
      >
        <UserCircle className="h-12 w-12 text-[#538d4e]" strokeWidth={1.25} />
        <p className="mt-5 font-mono text-xs font-bold uppercase tracking-[0.25em] text-[#538d4e]">PROFILE // COMING_SOON</p>
        <p className="mt-4 font-mono text-[10px] uppercase leading-relaxed tracking-wider text-[#565758]">
          Operative profiles, statistics, avatars, and achievements are still being encrypted.
        </p>
        <button
          type="button"
          onClick={() => router.push("/play")}
          className="mt-7 w-full rounded-lg bg-[#538d4e] py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-black transition-colors hover:bg-[#58a352]"
        >
          RETURN_TO_BASE
        </button>
      </motion.section>
    </main>
  );
}
