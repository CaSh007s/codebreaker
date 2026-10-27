export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000").replace(/\/$/, "");

export type GameStatus = "active" | "solved" | "failed" | "surrendered";
export type GameMode = "classic" | "timer" | "limited";

export interface AccountUser {
  user_id: string;
  username: string;
  created_at: string;
}

export interface AuthResponse {
  user: AccountUser;
}

export interface FriendRecord {
  user_id: string;
  username: string;
  status: "pending" | "accepted" | "blocked";
  direction?: "incoming" | "outgoing";
  created_at: string;
}

export interface NotificationRecord {
  notification_id: string;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, string>;
  read: boolean;
  created_at: string;
}

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

function saveLocalScore(score: Omit<LeaderboardEntry, "timestamp">): LeaderboardEntry {
  const entry: LeaderboardEntry = { ...score, timestamp: new Date().toISOString() };
  if (typeof window !== "undefined") {
    try {
      const stored = api.getLocalLeaderboard();
      localStorage.setItem("codebreaker_leaderboard", JSON.stringify([...stored, entry].slice(-100)));
    } catch { /* Private browsing may deny storage; the completed game is still shown. */ }
  }
  return entry;
}

export const api = {
  async register(username: string, password: string): Promise<AuthResponse> {
    return authRequest("/auth/register", username, password);
  },

  async login(username: string, password: string): Promise<AuthResponse> {
    return authRequest("/auth/login", username, password);
  },

  async logout(): Promise<void> {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  },

  async getCurrentAccount(): Promise<AuthResponse | null> {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      credentials: "include",
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("Could not load account");
    return response.json();
  },

  async getFriends(): Promise<FriendRecord[]> {
    return socialRequest<FriendRecord[]>("/social/friends");
  },

  async sendFriendRequest(username: string): Promise<FriendRecord> {
    return socialRequest<FriendRecord>("/social/friends/requests", {
      method: "POST",
      body: JSON.stringify({ username }),
    });
  },

  async respondToFriendRequest(userId: string, action: "accept" | "decline"): Promise<void> {
    await socialRequest<void>(`/social/friends/requests/${encodeURIComponent(userId)}/${action}`, { method: "POST" });
  },

  async removeFriend(userId: string): Promise<void> {
    await socialRequest<void>(`/social/friends/${encodeURIComponent(userId)}`, { method: "DELETE" });
  },

  async blockUser(userId: string): Promise<void> {
    await socialRequest<void>(`/social/blocks/${encodeURIComponent(userId)}`, { method: "POST" });
  },

  async getNotifications(): Promise<NotificationRecord[]> {
    return socialRequest<NotificationRecord[]>("/social/notifications");
  },

  async markNotificationRead(notificationId: string): Promise<void> {
    await socialRequest<void>(`/social/notifications/${encodeURIComponent(notificationId)}/read`, { method: "POST" });
  },

  async savePushSubscription(subscription: PushSubscription): Promise<void> {
    const json = subscription.toJSON();
    await socialRequest<void>("/social/push-subscriptions", {
      method: "POST",
      body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }),
    });
  },

  async createGame(mode: GameMode = "classic", length: number = 4, maxAttempts?: number, allowRepeats: boolean = true, timeLimit?: number): Promise<NewGameResponse> {
    const response = await fetch(`${API_BASE_URL}/game/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        mode, 
        code_length: length, 
        max_attempts: maxAttempts,
        allow_repeats: allowRepeats,
        time_limit: timeLimit
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

  async expire(gameId: string): Promise<{ secret_code: string; status: GameStatus }> {
    const response = await fetch(`${API_BASE_URL}/game/${gameId}/expire`, { method: "POST" });
    if (!response.ok) throw new Error("Could not finalize expired game");
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
    const entries = await response.json();
    return entries.map(normalizeEntry);
  },

  async postScore(score: Omit<LeaderboardEntry, "timestamp">): Promise<LeaderboardEntry> {
    let entry: LeaderboardEntry;
    try {
      const response = await fetch(`${API_BASE_URL}/leaderboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...score, timer_mode: score.timerMode, infinite_mode: score.infiniteMode }),
      });
      if (!response.ok) return saveLocalScore(score);
      entry = normalizeEntry(await response.json());
    } catch {
      return saveLocalScore(score);
    }
    // Also persist to localStorage
    try {
      const stored = api.getLocalLeaderboard();
      localStorage.setItem('codebreaker_leaderboard', JSON.stringify([...stored, entry].slice(-100)));
    } catch { /* A storage restriction must not turn a successful upload into a failure. */ }
    return entry;
  },

  getLocalLeaderboard(): LeaderboardEntry[] {
    if (typeof window === 'undefined') return [];
    let entries: LeaderboardEntry[];
    try {
      const stored = JSON.parse(localStorage.getItem('codebreaker_leaderboard') || '[]');
      if (!Array.isArray(stored)) return [];
      entries = stored.filter(e => e && typeof e.username === "string").map(normalizeEntry);
    } catch { return []; }
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

async function authRequest(path: string, username: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.detail || "Account request failed");
  }
  return response.json();
}

async function socialRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.detail || "Social request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

function normalizeEntry(entry: LeaderboardEntry & { timer_mode?: boolean; infinite_mode?: boolean }): LeaderboardEntry {
  return { ...entry, timerMode: entry.timer_mode ?? entry.timerMode ?? false, infiniteMode: entry.infinite_mode ?? entry.infiniteMode ?? false };
}
