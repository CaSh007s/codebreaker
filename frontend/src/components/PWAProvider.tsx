"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAProvider() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [online, setOnline] = useState(true);
  const [ios, setIos] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const onlineFrame = requestAnimationFrame(() => setOnline(navigator.onLine));
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    const installHandler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const frame = requestAnimationFrame(() => {
      setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
      setStandalone(window.matchMedia("(display-mode: standalone)").matches);
    });
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    window.addEventListener("beforeinstallprompt", installHandler);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    }
    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      window.removeEventListener("beforeinstallprompt", installHandler);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(onlineFrame);
    };
  }, []);

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  return (
    <>
      {!online && (
        <div role="status" className="fixed top-0 left-0 right-0 z-[10000] bg-amber-400 px-3 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-black">
          Offline mode // single-player available
        </div>
      )}
      {installEvent && (
        <button
          type="button"
          onClick={install}
          className="fixed bottom-4 left-1/2 z-[1000] -translate-x-1/2 rounded-xl border border-[#538d4e]/60 bg-[#121213] px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-[#538d4e] shadow-2xl"
        >
          Install Codebreaker
        </button>
      )}
      {ios && !standalone && (
        <div className="fixed bottom-4 left-1/2 z-[1000] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-white/15 bg-[#121213] px-4 py-3 text-center font-mono text-[10px] text-slate-300 shadow-2xl">
          Install on iPhone: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
        </div>
      )}
    </>
  );
}
