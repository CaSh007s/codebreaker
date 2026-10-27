import { create } from "zustand";
import { GameMode, GameStatus, api } from "@/lib/api";
import {
  createOfflineGame,
  getOfflineHint,
  isExpired,
  OfflineGameState,
  submitOfflineGuess,
} from "@/lib/offlineGame";

interface Guess {
  guess: string;
  feedback: string[];
}

interface GameStore {
  gameId: string | null;
  status: GameStatus;
  mode: GameMode;
  guesses: Guess[];
  currentGuess: string;
  codeLength: number;
  attemptsRemaining: number | null;
  timer: number;
  startedAt: number | null;
  error: string | null;
  view: 'landing' | 'game';
  isLoading: boolean;
  username: string;
  currentLevelLabel: string;
  timerLimit: number | null; // in seconds
  infiniteMode: boolean;
  menuState: 'main' | 'single' | 'category';
  revealedCode: string | null;
  hintsRevealed: { position: number; digit: string }[];
  hintsUsed: number;
  struckKeys: string[];
  offlineGame: OfflineGameState | null;

  // Actions
  setView: (view: 'landing' | 'game') => void;
  startNewGame: (mode?: GameMode, length?: number, maxAttempts?: number, allowRepeats?: boolean, levelLabel?: string) => Promise<void>;
  addDigit: (digit: string) => void;
  removeDigit: () => void;
  submitGuess: () => Promise<void>;
  resetError: () => void;
  setTimer: (t: number) => void;
  setUsername: (name: string) => void;
  setTimerLimit: (limit: number | null) => void;
  setInfiniteMode: (active: boolean) => void;
  setMenuState: (state: 'main' | 'single' | 'category') => void;
  triggerHint: (position?: number) => Promise<void>;
  calculateScore: () => number;
  toggleStruckKey: (key: string) => void;
  resignGame: () => Promise<void>;
  expireGame: () => Promise<void>;
}

const OFFLINE_GAME_KEY = "codebreaker_offline_game";

function readOfflineGame(): OfflineGameState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(OFFLINE_GAME_KEY);
    return raw ? (JSON.parse(raw) as OfflineGameState) : null;
  } catch {
    return null;
  }
}

function persistOfflineGame(game: OfflineGameState | null) {
  if (typeof window === "undefined") return;
  try {
    if (game) localStorage.setItem(OFFLINE_GAME_KEY, JSON.stringify(game));
    else localStorage.removeItem(OFFLINE_GAME_KEY);
  } catch {
    // Gameplay remains available when browser storage is restricted.
  }
}

const savedOfflineGame = readOfflineGame();

export const useGameStore = create<GameStore>()((set, get) => ({
  gameId: savedOfflineGame?.gameId ?? null,
  status: savedOfflineGame?.status ?? "active",
  mode: "classic",
  guesses: savedOfflineGame?.guesses ?? [],
  currentGuess: "",
  codeLength: savedOfflineGame?.codeLength ?? 4,
  attemptsRemaining: savedOfflineGame?.maxAttempts === null || !savedOfflineGame ? null : Math.max(0, savedOfflineGame.maxAttempts - savedOfflineGame.attempts),
  timer: savedOfflineGame ? Math.floor((Date.now() - savedOfflineGame.createdAt) / 1000) : 0,
  startedAt: savedOfflineGame?.createdAt ?? null,
  error: null,
  view: savedOfflineGame ? "game" : "landing",
  isLoading: false,
  username: "OPERATIVE_GHOST",
  currentLevelLabel: savedOfflineGame?.levelLabel ?? "ROOKIE",
  timerLimit: savedOfflineGame?.timeLimit ?? null,
  infiniteMode: savedOfflineGame?.infiniteMode ?? savedOfflineGame?.maxAttempts === null,
  menuState: 'main',
  revealedCode: savedOfflineGame?.status === "active" ? null : savedOfflineGame?.secretCode ?? null,
  hintsRevealed: savedOfflineGame?.revealedIndices.map((position) => ({ position, digit: savedOfflineGame.secretCode[position] })) ?? [],
  hintsUsed: savedOfflineGame?.revealedIndices.length ?? 0,
  struckKeys: [],
  offlineGame: savedOfflineGame,

  setView: (view) => {
    if (view === "landing") {
      persistOfflineGame(null);
      set({ view, offlineGame: null });
      return;
    }
    set({ view });
  },

  setUsername: (username) => {
    set({ username });
    if (typeof window !== 'undefined') {
      localStorage.setItem('codebreaker_operative', username);
    }
  },

  startNewGame: async (mode = "classic", length = 4, maxAttempts = 20, allowRepeats = true, levelLabel = "ROOKIE") => {
    const { infiniteMode, timerLimit, isLoading } = get();
    if (isLoading) return;
    set({
      isLoading: true,
      error: null,
      view: "game",
      timer: 0,
      startedAt: null,
      gameId: null,
      status: "active",
      attemptsRemaining: null,
      guesses: [],
      currentGuess: "",
      codeLength: length,
      currentLevelLabel: levelLabel,
      revealedCode: null,
      hintsRevealed: [],
      hintsUsed: 0,
      struckKeys: [],
      offlineGame: null,
    });
    try {
      const data = await api.createGame(
        mode, 
        length, 
        infiniteMode ? undefined : maxAttempts, 
        allowRepeats,
        timerLimit ?? undefined
      );
      set({
        offlineGame: null,
        gameId: data.game_id,
        codeLength: data.code_length,
        mode: data.mode as GameMode,
        attemptsRemaining: data.max_attempts ?? null,
        guesses: [],
        currentGuess: "",
        status: "active",
        isLoading: false,
        startedAt: Date.now(),
      });
    } catch {
      const offlineGame = createOfflineGame(
        length,
        infiniteMode ? undefined : maxAttempts,
        allowRepeats,
        timerLimit ?? undefined,
        levelLabel,
        infiniteMode,
      );
      persistOfflineGame(offlineGame);
      set({
        gameId: offlineGame.gameId,
        offlineGame,
        attemptsRemaining: offlineGame.maxAttempts,
        isLoading: false,
        error: "OFFLINE_MODE // LOCAL_MISSION_ACTIVE",
        view: "game",
        startedAt: offlineGame.createdAt,
      });
    }
  },

  addDigit: (digit: string) => {
    const { currentGuess, codeLength, status, isLoading, timer, timerLimit } = get();
    if (status !== "active" || isLoading || (timerLimit !== null && timer >= timerLimit) || currentGuess.length >= codeLength || !/^[0-9]$/.test(digit)) return;
    set({ currentGuess: currentGuess + digit });
  },

  removeDigit: () => {
    const { currentGuess, status, isLoading } = get();
    if (status !== "active" || isLoading || currentGuess.length === 0) return;
    set({ currentGuess: currentGuess.slice(0, -1) });
  },

  submitGuess: async () => {
    const { gameId, currentGuess, codeLength, status, isLoading, timerLimit, timer } = get();
    if (status !== "active" || currentGuess.length !== codeLength || !gameId || isLoading || (timerLimit !== null && timer >= timerLimit)) return;

    set({ isLoading: true, error: null });
    try {
      const offlineGame = get().offlineGame;
      let feedback: string[];
      let status: GameStatus;
      let revealedCode: string | undefined;
      let attemptsRemaining: number | null | undefined;
      if (offlineGame) {
        const result = submitOfflineGuess(offlineGame, currentGuess);
        feedback = result.feedback;
        status = result.status;
        revealedCode = result.secretCode;
        attemptsRemaining = result.attemptsRemaining;
      } else {
        const result = await api.submitGuess(gameId, currentGuess);
        feedback = result.shuffled_feedback;
        status = result.status;
        revealedCode = result.secret_code;
        attemptsRemaining = result.attempts_remaining;
      }
      if (offlineGame) persistOfflineGame(offlineGame);
      set((state: GameStore) => ({
        guesses: offlineGame
          ? offlineGame.guesses
          : (feedback.length ? [...state.guesses, { guess: currentGuess, feedback }] : state.guesses),
        currentGuess: "",
        status,
        revealedCode: revealedCode || null,
        attemptsRemaining: attemptsRemaining ?? null,
        isLoading: false,
      }));
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  resetError: () => set({ error: null }),
  setTimer: (timer: number) => set({ timer }),
  setTimerLimit: (timerLimit: number | null) => set({ timerLimit }),
  setInfiniteMode: (infiniteMode: boolean) => set({ infiniteMode }),
  setMenuState: (menuState: 'main' | 'single' | 'category') => set({ menuState }),

  triggerHint: async (position?: number) => {
    const { gameId, hintsRevealed, codeLength, status, isLoading } = get();
    if (!gameId || status !== "active" || isLoading) return;
    
    // Max hints rule: codeLength - 2
    const maxHints = Math.max(0, codeLength - 2);
    if (hintsRevealed.length >= maxHints) {
        set({ error: `MAXIMUM_HINTS_REACHED: AT LEAST 2 DIGITS MUST REMAIN UNREVEALED` });
        return;
    }

    // Check if index already revealed
    if (position !== undefined && hintsRevealed.some(h => h.position === position)) {
        return;
    }

    set({ isLoading: true, error: null });
      try {
        const revealedIndices = hintsRevealed.map(h => h.position);
        const offlineGame = get().offlineGame;
        const data = offlineGame
          ? getOfflineHint(offlineGame, position)
          : await api.getHint(gameId, revealedIndices, position);
        if (offlineGame) persistOfflineGame(offlineGame);
        set((state: GameStore) => ({
            hintsRevealed: [...state.hintsRevealed, data],
            hintsUsed: state.hintsUsed + 1,
            isLoading: false
        }));
    } catch (err) {
        set({ error: (err as Error).message, isLoading: false });
    }
  },

  toggleStruckKey: (key: string) => {
    const { struckKeys } = get();
    if (struckKeys.includes(key)) {
        set({ struckKeys: struckKeys.filter(k => k !== key) });
    } else {
        set({ struckKeys: [...struckKeys, key] });
    }
  },

  resignGame: async () => {
    const { gameId, status, isLoading, username, currentLevelLabel, guesses, timer, timerLimit, infiniteMode } = get();
    if (!gameId || status !== "active" || isLoading) return;

    set({ isLoading: true, error: null });
    try {
        const offlineGame = get().offlineGame;
        const data = offlineGame
          ? (offlineGame.status = "surrendered", persistOfflineGame(offlineGame), { secret_code: offlineGame.secretCode })
          : await api.surrender(gameId);
        set({ status: "surrendered", revealedCode: data.secret_code, isLoading: false });
        // Post to leaderboard as resigned
        await api.postScore({
            username,
            level: currentLevelLabel,
            tries: guesses.length,
            time_seconds: timer,
            status: "surrendered",
            score: 0,
            timerMode: timerLimit !== null,
            infiniteMode
        });
        
    } catch (err) {
        if (get().gameId === gameId) set({ error: (err as Error).message, isLoading: false });
    }
  },

  expireGame: async () => {
    const { gameId, status, isLoading } = get();
    if (!gameId || status !== "active" || isLoading) return;
    set({ isLoading: true });
    try {
      const offlineGame = get().offlineGame;
      if (offlineGame) {
        if (!isExpired(offlineGame)) {
          set({ isLoading: false });
          return;
        }
        offlineGame.status = "failed";
        persistOfflineGame(offlineGame);
        set({ status: "failed", revealedCode: offlineGame.secretCode, isLoading: false });
      } else {
        const data = await api.expire(gameId);
        set({ status: data.status, revealedCode: data.secret_code, isLoading: false });
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  calculateScore: () => {
    const { status, guesses, hintsUsed, currentLevelLabel, timerLimit, infiniteMode } = get();
    if (status !== "solved") return 0;

    // Base points by difficulty
    const baseScores: Record<string, number> = {
        ROOKIE: 500,
        EASY: 1000,
        MEDIUM: 2000,
        HARD: 3500,
        ELITE: 5000,
        MASTER: 10000
    };
    const base = baseScores[currentLevelLabel] || 1000;

    // Efficiency: fewer guesses = higher multiplier (1st try = 2x, degrades)
    const maxGuessesForLevel: Record<string, number> = {
        ROOKIE: 25, EASY: 20, MEDIUM: 15, HARD: 10, ELITE: 15, MASTER: 10
    };
    const maxG = maxGuessesForLevel[currentLevelLabel] || 20;
    const efficiencyRatio = Math.max(0.1, 1 - (guesses.length - 1) / maxG);

    // Hint penalty: -150 per hint
    const hintPenalty = hintsUsed * 150;

    // Timer bonus: 1.5x multiplier if timer was active
    const timerMultiplier = timerLimit ? 1.5 : 1.0;

    // Unlimited tries penalty: 0.7x multiplier
    const infiniteMultiplier = infiniteMode ? 0.7 : 1.0;

    const raw = (base * efficiencyRatio - hintPenalty) * timerMultiplier * infiniteMultiplier;
    return Math.max(50, Math.round(raw));
  },
}));

// Initialize username from localStorage if available
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem('codebreaker_operative');
  if (saved) {
    useGameStore.getState().setUsername(saved);
  }
}
