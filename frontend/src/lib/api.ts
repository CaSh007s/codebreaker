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
}

export interface LeaderboardEntry {
  username: string;
  level: string;
  tries: number;
  time_seconds: number;
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
    return response.json();
  }
};
