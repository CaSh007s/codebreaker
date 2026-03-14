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
  isLoading: boolean;

  // Actions
  startNewGame: (mode?: GameMode, length?: number, maxAttempts?: number) => Promise<void>;
  addDigit: (digit: string) => void;
  removeDigit: () => void;
  submitGuess: () => Promise<void>;
  resetError: () => void;
  setTimer: (t: number) => void;
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
  isLoading: false,

  startNewGame: async (mode = "classic", length = 4, maxAttempts = 20) => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.createGame(mode, length, maxAttempts);
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
        attemptsRemaining: data.attempts_remaining ?? null,
        isLoading: false,
      }));
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  resetError: () => set({ error: null }),
  setTimer: (timer: number) => set({ timer }),
}));
