"use client";

import {
  ChevronRight,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  MessagesSquare,
  Search,
  Swords,
  Target,
  UserRound,
  UserPlus,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, API_BASE_URL, AccountUser } from "@/lib/api";
import { NotificationCenter } from "@/components/social/SocialCenter";
import { useGameStore } from "@/store/useGameStore";

type NavigationItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

const PUBLIC_NAVIGATION: NavigationItem[] = [
  { href: "/play", label: "Home", description: "Mission control", icon: LayoutDashboard },
  { href: "/play?mode=single", label: "Single Player", description: "Run a solo breach", icon: Target },
  { href: "/multiplayer", label: "Multiplayer", description: "Challenge an operative", icon: Swords },
];

const ACCOUNT_NAVIGATION: NavigationItem[] = [
  { href: "/friends", label: "Friends", description: "Your trusted network", icon: UserPlus },
  { href: "/messages", label: "Messages", description: "Secure channels", icon: MessagesSquare },
  { href: "/profile", label: "Profile", description: "Your operative record", icon: UserRound },
];

const LOGIN_NAVIGATION: NavigationItem = {
  href: "/",
  label: "Login / Sign Up",
  description: "Connect your account",
  icon: LogIn,
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mode = useSearchParams().get("mode");
  const router = useRouter();
  const singlePlayerMissionActive = useGameStore((state) => state.view === "game" && state.status === "active");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [serviceOnline, setServiceOnline] = useState(true);
  const [multiplayerMissionActive, setMultiplayerMissionActive] = useState(false);

  useEffect(() => {
    const updateMissionState = (event: Event) => {
      const active = (event as CustomEvent<{ active?: boolean }>).detail?.active === true;
      setMultiplayerMissionActive(active);
    };
    window.addEventListener("codebreaker-mission-state", updateMissionState);
    return () => window.removeEventListener("codebreaker-mission-state", updateMissionState);
  }, []);

  useEffect(() => {
    const refreshAccount = () => {
      void api.getCurrentAccount()
        .then((response) => setAccount(response?.user ?? null))
        .catch(() => setAccount(null));
    };
    refreshAccount();
    window.addEventListener("codebreaker-auth-changed", refreshAccount);
    return () => window.removeEventListener("codebreaker-auth-changed", refreshAccount);
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    const retractForRegistry = () => {
      setSidebarOpen(false);
      setMobileMenuOpen(false);
    };
    window.addEventListener("codebreaker-registry-opened", retractForRegistry);
    return () => window.removeEventListener("codebreaker-registry-opened", retractForRegistry);
  }, []);

  useEffect(() => {
    let active = true;
    const checkService = async () => {
      if (!navigator.onLine) {
        if (active) setServiceOnline(false);
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/health`, { cache: "no-store" });
        if (active) setServiceOnline(response.ok);
      } catch {
        if (active) setServiceOnline(false);
      }
    };
    void checkService();
    const timer = window.setInterval(() => void checkService(), 30_000);
    const update = () => void checkService();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const signOut = async () => {
    await api.logout().catch(() => undefined);
    sessionStorage.setItem("codebreaker_entry_access", "guest");
    setAccount(null);
    window.dispatchEvent(new Event("codebreaker-auth-changed"));
    router.push("/");
  };

  const missionActive = (pathname === "/play" && singlePlayerMissionActive) || multiplayerMissionActive;
  const showAppNavigation = pathname !== "/" && !missionActive;
  const navigation = account ? [...PUBLIC_NAVIGATION, ...ACCOUNT_NAVIGATION] : PUBLIC_NAVIGATION;
  const mobileNavigation = account
    ? [...PUBLIC_NAVIGATION, ACCOUNT_NAVIGATION[1]]
    : [...PUBLIC_NAVIGATION, LOGIN_NAVIGATION];

  return (
    <div className="app-shell min-h-dvh bg-[#080a08]">
      {showAppNavigation && sidebarOpen && <button type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-[140] hidden cursor-default lg:block" />}
      {showAppNavigation && <DesktopSidebar account={account} navigation={navigation} pathname={pathname} mode={mode} open={sidebarOpen} serviceOnline={serviceOnline} onExpand={() => setSidebarOpen(true)} onClose={() => setSidebarOpen(false)} onSignOut={() => void signOut()} />}
      {showAppNavigation && <MobileSearchBar />}
      {showAppNavigation && <MobileDrawer account={account} navigation={navigation} mode={mode} open={mobileMenuOpen} serviceOnline={serviceOnline} onClose={() => setMobileMenuOpen(false)} onSignOut={() => void signOut()} />}
      {showAppNavigation && <MobileBottomNavigation navigation={mobileNavigation} pathname={pathname} mode={mode} onMenu={() => setMobileMenuOpen(true)} />}

      <div className={`app-shell-content min-h-dvh transition-[padding] duration-500 ease-[cubic-bezier(.22,1,.36,1)] ${showAppNavigation ? (sidebarOpen ? "lg:pl-64" : "lg:pl-[84px]") : ""}`}>
        {showAppNavigation && <DesktopUtilityBar />}
        {children}
      </div>
    </div>
  );
}

function DesktopSidebar({
  account,
  navigation,
  pathname,
  mode,
  open,
  serviceOnline,
  onExpand,
  onClose,
  onSignOut,
}: {
  account: AccountUser | null;
  navigation: NavigationItem[];
  pathname: string;
  mode: string | null;
  open: boolean;
  serviceOnline: boolean;
  onExpand: () => void;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const router = useRouter();
  return (
    <aside
      aria-label="Primary navigation"
      className={`fixed inset-y-0 left-0 z-[150] hidden flex-col border-r border-[#242c22] bg-[#0b0f0c]/95 text-slate-100 shadow-[18px_0_60px_rgba(0,0,0,0.28)] backdrop-blur-2xl transition-[width] duration-500 ease-[cubic-bezier(.22,1,.36,1)] lg:flex ${open ? "w-64" : "w-[84px]"}`}
    >
      <div className={`flex h-24 shrink-0 items-center border-b border-[#242c22] px-5 ${open ? "justify-start" : "justify-center"}`}>
        <button type="button" aria-label="Open home" onClick={() => { if (!open) onExpand(); else { onClose(); router.push("/play"); } }} className="group flex min-w-0 items-center gap-3 text-left">
          <BrandMark />
          <span className={`min-w-0 overflow-hidden transition-[max-width,opacity] duration-300 ${open ? "max-w-36 opacity-100" : "max-w-0 opacity-0"}`}>
            <span className="block whitespace-nowrap font-sans text-[15px] font-bold tracking-[0.18em] text-[#edf3e9]">CODEBREAKER</span>
            <span className="mt-1 block whitespace-nowrap font-mono text-[8px] uppercase tracking-[0.28em] text-[#729169]">Tactical uplink</span>
          </span>
        </button>
      </div>

      <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 py-6" aria-label="Application">
        <NavSectionLabel open={open} label="Operations" />
        <div className="space-y-1">
          {navigation.slice(0, 3).map((item) => <NavItem key={item.href} item={item} pathname={pathname} mode={mode} expanded={open} onExpand={onExpand} onNavigate={onClose} />)}
        </div>
        {account && navigation.length > 3 && (
          <>
            <NavSectionLabel open={open} label="Social" className="mt-7" />
            <div className="space-y-1">
              {navigation.slice(3).map((item) => <NavItem key={item.href} item={item} pathname={pathname} mode={mode} expanded={open} onExpand={onExpand} onNavigate={onClose} />)}
            </div>
          </>
        )}
        {!account && (
          <div className="mt-7 border-t border-[#242c22] pt-5">
            <NavItem item={LOGIN_NAVIGATION} pathname={pathname} mode={mode} expanded={open} onExpand={onExpand} onNavigate={onClose} />
          </div>
        )}
      </nav>

      <div className="shrink-0 border-t border-[#242c22] px-3 py-4">
        <StatusRow open={open} serviceOnline={serviceOnline} />
        {account && (
          <div className={`mt-4 flex items-center gap-3 rounded-xl border border-transparent px-2 py-2 ${open ? "" : "justify-center"}`}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#52694a] bg-[#182218] font-mono text-[10px] font-bold text-[#b8db85]">{account.username.slice(0, 2).toUpperCase()}</span>
            <span className={`min-w-0 overflow-hidden transition-[max-width,opacity] duration-300 ${open ? "max-w-36 opacity-100" : "max-w-0 opacity-0"}`}>
              <span className="block truncate font-sans text-xs font-semibold text-[#e5eee0]">{account.username}</span>
              <span className="mt-0.5 block truncate font-mono text-[8px] text-[#71816d]">#{account.discriminator}</span>
            </span>
            {open && <button type="button" onClick={onSignOut} aria-label="Sign out" className="ml-auto rounded-lg p-1.5 text-[#71816d] transition-colors hover:bg-[#cf6679]/10 hover:text-[#cf8896]"><LogOut className="h-3.5 w-3.5" /></button>}
          </div>
        )}
      </div>
    </aside>
  );
}

function MobileSearchBar() {
  return <div className="fixed inset-x-3 top-3 z-[170] lg:hidden"><ProfileSearch /></div>;
}

function DesktopUtilityBar() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[120] hidden items-start justify-center px-6 pt-4 lg:flex">
      <div className="pointer-events-auto w-full max-w-lg"><ProfileSearch /></div>
      <div className="pointer-events-auto absolute right-6 top-4"><NotificationCenter /></div>
    </div>
  );
}

function MobileDrawer({
  account,
  navigation,
  mode,
  open,
  serviceOnline,
  onClose,
  onSignOut,
}: {
  account: AccountUser | null;
  navigation: NavigationItem[];
  mode: string | null;
  open: boolean;
  serviceOnline: boolean;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const pathname = usePathname();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[190] bg-black/70 backdrop-blur-sm lg:hidden" onClick={onClose}>
      <aside className="flex h-full w-[min(88vw,340px)] flex-col border-r border-[#344431] bg-[#0b100c] shadow-[24px_0_70px_rgba(0,0,0,0.55)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex h-24 shrink-0 items-center justify-between border-b border-[#242c22] px-5">
          <div className="flex items-center gap-3"><BrandMark /><div><p className="font-sans text-sm font-bold tracking-[0.16em] text-[#edf3e9]">CODEBREAKER</p><p className="mt-1 font-mono text-[8px] uppercase tracking-[0.28em] text-[#729169]">Navigation deck</p></div></div>
          <button type="button" aria-label="Close navigation" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg border border-[#3b5137] text-[#91a78a] hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 py-6">
          <NavSectionLabel open label="Operations" />
          <div className="space-y-1">{navigation.slice(0, 3).map((item) => <NavItem key={item.href} item={item} pathname={pathname} mode={mode} expanded onNavigate={onClose} />)}</div>
          {account && navigation.length > 3 && <><NavSectionLabel open label="Social" className="mt-7" /><div className="space-y-1">{navigation.slice(3).map((item) => <NavItem key={item.href} item={item} pathname={pathname} mode={mode} expanded onNavigate={onClose} />)}</div></>}
          {!account && <div className="mt-7 border-t border-[#242c22] pt-5"><NavItem item={LOGIN_NAVIGATION} pathname={pathname} mode={mode} expanded onNavigate={onClose} /></div>}
        </nav>
        <div className="border-t border-[#242c22] px-4 py-4"><StatusRow open serviceOnline={serviceOnline} />{account && <button type="button" onClick={onSignOut} className="mt-4 flex w-full items-center gap-3 rounded-xl px-2 py-2 font-mono text-[9px] uppercase tracking-widest text-[#778777] transition-colors hover:bg-[#cf6679]/10 hover:text-[#cf8896]"><LogOut className="h-4 w-4" />Sign out</button>}</div>
      </aside>
    </div>
  );
}

function MobileBottomNavigation({ navigation, pathname, mode, onMenu }: { navigation: NavigationItem[]; pathname: string; mode: string | null; onMenu: () => void }) {
  return (
    <nav className="mobile-bottom-dock fixed inset-x-3 z-[90] flex h-[68px] items-center justify-around rounded-2xl border border-[#344431] bg-[#0c120d]/95 px-2 shadow-[0_16px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl lg:hidden" aria-label="Quick navigation">
      {navigation.map((item) => <MobileNavItem key={item.href} item={item} pathname={pathname} mode={mode} />)}
      <button type="button" onClick={onMenu} className="group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[#778777] transition-colors hover:text-[#d7e8ca]"><span className="grid h-7 w-7 place-items-center rounded-lg border border-transparent transition-colors group-hover:border-[#52694a] group-hover:bg-[#172116]"><Menu className="h-4 w-4" /></span><span className="font-mono text-[8px] uppercase tracking-wider">More</span></button>
    </nav>
  );
}

function BrandMark({ small = false }: { small?: boolean }) {
  return <span className={`relative grid shrink-0 place-items-center rounded-xl border border-[#4e6948]/70 bg-[#111711] shadow-[0_0_22px_rgba(83,141,78,0.14)] ${small ? "h-8 w-8 rounded-lg" : "h-11 w-11"}`}><Image src="/app-icon.png" alt="" width={small ? 28 : 36} height={small ? 28 : 36} className={`${small ? "h-7 w-7 rounded-md" : "h-9 w-9 rounded-lg"} object-cover`} /></span>;
}

function NavSectionLabel({ open, label, className = "" }: { open: boolean; label: string; className?: string }) {
  return <div className={`mb-2 flex items-center gap-2 px-3 font-mono text-[8px] uppercase tracking-[0.28em] text-[#596b56] ${className} ${open ? "" : "justify-center"}`}><span className="h-px w-3 bg-[#465842]" /><span className={open ? "" : "sr-only"}>{label}</span></div>;
}

function StatusRow({ open, serviceOnline }: { open: boolean; serviceOnline: boolean }) {
  return <div className={`flex items-center gap-3 px-2 ${open ? "" : "justify-center"}`} title={serviceOnline ? "Service online" : "Service offline"}><span className={`h-2 w-2 shrink-0 rounded-full ${serviceOnline ? "bg-[#9bdb68] shadow-[0_0_12px_#9bdb68]" : "bg-[#cf6679] shadow-[0_0_12px_#cf6679]"}`} /><span className={`overflow-hidden transition-[max-width,opacity] duration-300 ${open ? "max-w-40 opacity-100" : "max-w-0 opacity-0"}`}><span className="block whitespace-nowrap font-mono text-[8px] uppercase tracking-[0.22em] text-[#748570]">Network status</span><span className={`mt-1 block whitespace-nowrap font-mono text-[10px] uppercase ${serviceOnline ? "text-[#b8db85]" : "text-[#cf8896]"}`}>{serviceOnline ? "Operational" : "Offline"}</span></span></div>;
}

function NavItem({ item, pathname, mode, expanded, onExpand, onNavigate, prominent = false }: { item: NavigationItem; pathname: string; mode: string | null; expanded: boolean; onExpand?: () => void; onNavigate: () => void; prominent?: boolean }) {
  const router = useRouter();
  const Icon = item.icon;
  const active = isNavigationItemActive(item, pathname, mode);
  return (
    <button type="button" onClick={() => { if (!expanded) { onExpand?.(); return; } onNavigate(); router.push(item.href); }} title={!expanded ? item.label : undefined} aria-current={active ? "page" : undefined} className={`group relative flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all duration-300 ${expanded ? "" : "justify-center"} ${active ? "border-[#66845c]/70 bg-[#6a8c5c]/15 text-[#dcebc9] shadow-[inset_0_0_22px_rgba(125,181,97,0.06)]" : "border-transparent text-[#858f82] hover:border-[#3d5039] hover:bg-white/[0.035] hover:text-[#ecf2e7]"} ${prominent ? "text-[#b8db85]" : ""}`}>
      {active && <span className="absolute bottom-2 left-0 h-5 w-0.5 rounded-full bg-[#b8db85] shadow-[0_0_10px_#b8db85]" />}
      <Icon className={`h-[18px] w-[18px] shrink-0 transition-transform duration-300 group-hover:scale-110 ${active ? "text-[#b8db85]" : ""}`} strokeWidth={1.8} />
      <span className={`min-w-0 overflow-hidden transition-[max-width,opacity] duration-300 ${expanded ? "max-w-44 opacity-100" : "max-w-0 opacity-0"}`}><span className="block truncate font-sans text-[13px] font-medium">{item.label}</span>{expanded && <span className="mt-0.5 block truncate font-mono text-[8px] uppercase tracking-wider text-[#677866]">{item.description}</span>}</span>
      {expanded && active && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-[#789b6a]" />}
    </button>
  );
}

function MobileNavItem({ item, pathname, mode }: { item: NavigationItem; pathname: string; mode: string | null }) {
  const router = useRouter();
  const Icon = item.icon;
  const active = isNavigationItemActive(item, pathname, mode);
  return <button type="button" onClick={() => router.push(item.href)} aria-label={item.label} aria-current={active ? "page" : undefined} className={`group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors ${active ? "text-[#c9e99a]" : "text-[#778777] hover:text-[#d7e8ca]"}`}><span className={`grid h-7 w-7 place-items-center rounded-lg border transition-all ${active ? "border-[#66845c] bg-[#263b24] shadow-[0_0_16px_rgba(125,181,97,0.16)]" : "border-transparent group-hover:border-[#52694a] group-hover:bg-[#172116]"}`}><Icon className="h-4 w-4" strokeWidth={active ? 2 : 1.7} /></span><span className="truncate font-mono text-[8px] uppercase tracking-wider">{item.label === "Single Player" ? "Solo" : item.label === "Multiplayer" ? "Versus" : item.label === "Login / Sign Up" ? "Login" : item.label}</span></button>;
}

function isNavigationItemActive(item: NavigationItem, pathname: string, mode: string | null) {
  if (item.href === "/play") return pathname === "/play" && mode !== "single";
  if (item.href === "/play?mode=single") return pathname === "/play" && mode === "single";
  if (item.href === "/") return pathname === "/";
  return pathname.startsWith(item.href);
}

function ProfileSearch() {
  const router = useRouter();
  const [callsign, setCallsign] = useState("");
  const [discriminator, setDiscriminator] = useState("");
  const [error, setError] = useState(false);

  const search = () => {
    const name = callsign.trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (!name || !/^\d{4}$/.test(discriminator)) {
      setError(true);
      return;
    }
    setError(false);
    router.push(`/profile?identity=${encodeURIComponent(`${name}#${discriminator}`)}`);
  };

  return (
    <div className={`mx-auto flex h-11 w-full items-center gap-2 rounded-xl border bg-[#101610]/95 px-3 shadow-[0_12px_35px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-colors ${error ? "border-[#cf6679]/70" : "border-[#435540] focus-within:border-[#91b37c]"}`}>
      <Search className="h-[18px] w-[18px] shrink-0 text-[#aeb8a7]" />
      <input value={callsign} onChange={(event) => { setCallsign(event.target.value.replace(/[^a-zA-Z0-9_]/g, "")); setError(false); }} onKeyDown={(event) => { if (event.key === "Enter") search(); }} placeholder="Search operative" aria-label="Search callsign" className="min-w-0 flex-1 bg-transparent font-sans text-sm text-slate-100 outline-none placeholder:text-[#7b8579]" />
      <span className="font-mono text-[#687468]">#</span>
      <input value={discriminator} maxLength={4} inputMode="numeric" onChange={(event) => { setDiscriminator(event.target.value.replace(/\D/g, "")); setError(false); }} onKeyDown={(event) => { if (event.key === "Enter") search(); }} placeholder="1234" aria-label="Search discriminator" className="w-10 bg-transparent font-mono text-xs text-slate-100 outline-none placeholder:text-[#687468]" />
      <button type="button" aria-label="Search profile" onClick={search} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#394737] bg-white/[0.03] text-[#9ca99a] transition-colors hover:border-[#91b37c] hover:bg-[#91b37c]/10 hover:text-[#c9e99a]"><ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}
