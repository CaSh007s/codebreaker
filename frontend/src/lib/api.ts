export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type GameStatus = "active" | "solved" | "failed" | "surrendered";
export type GameMode = "classic" | "timer" | "limited";

export interface NewGameResponse {
  game_id: string;
  code_length: number;
  mode: GameMode;
  max_attempts?: number;
}

export interface GuessResponse {
  bulls: number;
  cows: number;
  gray: number;
  shuffled_feedback: string[];
  solved: boolean;
  attempts_remaining?: number;
  status: GameStatus;
  secret_code?: string;
}

export interface LeaderboardEntry {
  username: string;
  level: string;
  tries: number;
  time_seconds: number;
  status: GameStatus;
  score: number;
  timerMode: boolean;
  infiniteMode: boolean;
  timestamp: string;
}

export const api = {
  async createGame(mode: GameMode = "classic", length: number = 4, maxAttempts?: number, allowRepeats: boolean = true): Promise<NewGameResponse> {
    const response = await fetch(`${API_BASE_URL}/game/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode, 
        code_length: length, 
        max_attempts: maxAttempts,
        allow_repeats: allowRepeats
      }),
    });
    if (!response.ok) throw new Error("Failed to create game");
    return response.json();
  },

  async submitGuess(gameId: string, guess: string): Promise<GuessResponse> {
    const response = await fetch(`${API_BASE_URL}/game/${gameId}/guess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guess }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to submit guess");
    }
    return response.json();
  },

  async surrender(gameId: string): Promise<{ secret_code: string }> {
    const response = await fetch(`${API_BASE_URL}/game/${gameId}/surrender`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("Failed to surrender");
    return response.json();
  },

  async getHint(gameId: string, revealedIndices: number[], targetIndex?: number): Promise<{ position: number; digit: string }> {
    const response = await fetch(`${API_BASE_URL}/game/${gameId}/hint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        revealed_indices: revealedIndices,
        target_index: targetIndex
      }),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to get hint");
    }
    return response.json();
  },

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const response = await fetch(`${API_BASE_URL}/leaderboard`);
    if (!response.ok) throw new Error("Failed to fetch leaderboard");
    return response.json();
  },

  async postScore(score: Omit<LeaderboardEntry, "timestamp">): Promise<LeaderboardEntry> {
    const response = await fetch(`${API_BASE_URL}/leaderboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(score),
    });
    if (!response.ok) throw new Error("Failed to post score");
    const entry = await response.json();
    // Also persist to localStorage
    const stored = JSON.parse(localStorage.getItem('codebreaker_leaderboard') || '[]');
    stored.push(entry);
    localStorage.setItem('codebreaker_leaderboard', JSON.stringify(stored));
    return entry;
  },

  getLocalLeaderboard(): LeaderboardEntry[] {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem('codebreaker_leaderboard');
    if (!stored) return [];
    const entries: LeaderboardEntry[] = JSON.parse(stored);
    const statusPriority: Record<string, number> = { solved: 0, surrendered: 1, failed: 2, active: 3 };
    return entries.sort((a, b) => {
      const sp = (statusPriority[a.status] ?? 99) - (statusPriority[b.status] ?? 99);
      if (sp !== 0) return sp;
      return b.score - a.score;
    });
  },

  clearLeaderboard(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('codebreaker_leaderboard');
    }
  }
};
