import { create } from "zustand";
import { GameMode, GameStatus, api } from "@/lib/api";

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
}

export const useGameStore = create<GameStore>()((set, get) => ({
  gameId: null,
  status: "active",
  mode: "classic",
  guesses: [],
  currentGuess: "",
  codeLength: 4,
  attemptsRemaining: null,
  timer: 0,
  error: null,
  view: "landing",
  isLoading: false,
  username: "OPERATIVE_GHOST",
  currentLevelLabel: "ROOKIE",
  timerLimit: null,
  infiniteMode: false,
  menuState: 'main',
  revealedCode: null,
  hintsRevealed: [],
  hintsUsed: 0,
  struckKeys: [],

  setView: (view) => set({ view }),

  setUsername: (username) => {
    set({ username });
    if (typeof window !== 'undefined') {
      localStorage.setItem('codebreaker_operative', username);
    }
  },

  startNewGame: async (mode = "classic", length = 4, maxAttempts = 20, allowRepeats = true, levelLabel = "ROOKIE") => {
    const { infiniteMode } = get();
    set({ 
        isLoading: true, 
        error: null, 
        view: "game", 
        timer: 0, 
        currentLevelLabel: levelLabel,
        revealedCode: null,
        hintsRevealed: [],
        hintsUsed: 0,
        struckKeys: []
    });
    try {
      const data = await api.createGame(
        mode, 
        length, 
        infiniteMode ? undefined : maxAttempts, 
        allowRepeats
      );
      set({
        gameId: data.game_id,
        codeLength: data.code_length,
        mode: data.mode as GameMode,
        attemptsRemaining: data.max_attempts ?? null,
        guesses: [],
        currentGuess: "",
        status: "active",
        isLoading: false,
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  addDigit: (digit: string) => {
    const { currentGuess, codeLength, status } = get();
    if (status !== "active" || currentGuess.length >= codeLength) return;
    set({ currentGuess: currentGuess + digit });
  },

  removeDigit: () => {
    const { currentGuess, status } = get();
    if (status !== "active" || currentGuess.length === 0) return;
    set({ currentGuess: currentGuess.slice(0, -1) });
  },

  submitGuess: async () => {
    const { gameId, currentGuess, codeLength, status, isLoading } = get();
    if (status !== "active" || currentGuess.length !== codeLength || !gameId || isLoading) return;

    set({ isLoading: true, error: null });
    try {
      const data = await api.submitGuess(gameId, currentGuess);
      set((state: GameStore) => ({
        guesses: [...state.guesses, { guess: currentGuess, feedback: data.shuffled_feedback }],
        currentGuess: "",
        status: data.status,
        revealedCode: data.secret_code || null,
        attemptsRemaining: data.attempts_remaining ?? null,
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
        const data = await api.getHint(gameId, revealedIndices, position);
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
        const data = await api.surrender(gameId);
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
        
        set({ 
            status: "surrendered",
            revealedCode: data.secret_code,
            isLoading: false
        });
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
