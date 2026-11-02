import {
  blockLocalUser,
  getLocalBlockedUsers,
  getLocalDirectMessages,
  getLocalCurrentAccount,
  getLocalFriends,
  getLocalNotifications,
  hasLocalAccount,
  hasLocalSession,
  loginLocal,
  logoutLocal,
  markLocalNotificationRead,
  registerLocal,
  reportLocalUser,
  removeLocalFriend,
  respondToLocalFriendRequest,
  sendLocalFriendRequest,
  sendLocalDirectMessage,
  unblockLocalUser,
  challengeLocalFriend,
  getLocalProfile,
  isLocalFallbackEnabled,
  updateLocalAvatar,
  updateLocalUsername,
} from "./localStore";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000").replace(/\/$/, "");

export type GameStatus = "active" | "solved" | "failed" | "surrendered";
export type GameMode = "classic" | "timer" | "limited";

export interface AccountUser {
  user_id: string;
  username: string;
  discriminator: string;
  avatar_url?: string | null;
  created_at: string;
}

export interface AuthResponse {
  user: AccountUser;
}

export interface FriendRecord {
  user_id: string;
  username: string;
  discriminator: string;
  status: "pending" | "accepted" | "blocked";
  direction?: "incoming" | "outgoing";
  blocked_by?: string;
  created_at: string;
}

export interface ProfileRecords {
  games_played: number;
  wins: number;
  losses: number;
  best_score: number;
}

export interface ProfileResponse extends AccountUser {
  friend_count: number;
  friendship_status: string | null;
  is_self: boolean;
  records: ProfileRecords;
}

export function formatAccountIdentity(user: Pick<AccountUser, "username" | "discriminator">): string {
  return `${user.username}#${user.discriminator}`;
}

export function formatFriendIdentity(friend: Pick<FriendRecord, "username" | "discriminator">): string {
  return `${friend.username}#${friend.discriminator}`;
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

export interface DirectMessageRecord {
  message_id: string;
  sender_id: string;
  sender_username: string;
  body: string;
  created_at: string;
  read: boolean;
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
  suspicious?: boolean;
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

  async updateUsername(username: string): Promise<AuthResponse> {
    if (isLocalFallbackEnabled() && hasLocalSession()) return updateLocalUsername(username);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.detail || "Could not update callsign");
      }
      return normalizeAuthResponse(await response.json());
    } catch (error) {
      if (error instanceof TypeError) throw new Error("OPERATIVE_OFFLINE // CALLSIGN_UPDATE_REQUIRES_ONLINE_UPLINK");
      throw error;
    }
  },

  async updateAvatar(avatarUrl: string): Promise<AuthResponse> {
    if (isLocalFallbackEnabled() && hasLocalSession()) return updateLocalAvatar(avatarUrl);
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ avatar_url: avatarUrl }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || "Could not update avatar");
    }
    return normalizeAuthResponse(await response.json());
  },

  async logout(): Promise<void> {
    const local = hasLocalSession();
    logoutLocal();
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      if (!local) throw new Error("Could not sign out");
    }
  },

  async getCurrentAccount(): Promise<AuthResponse | null> {
    const local = getLocalCurrentAccount();
    if (isLocalFallbackEnabled() && local) return local;
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/auth/me`, {
        credentials: "include",
      });
    } catch {
      throw new Error("OPERATIVE_OFFLINE // ACCOUNT_SERVICE_REQUIRES_ONLINE_UPLINK");
    }
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("Could not load account");
    return normalizeAuthResponse(await response.json());
  },

  async getFriends(): Promise<FriendRecord[]> {
    if (isLocalFallbackEnabled() && hasLocalSession()) return getLocalFriends();
    return socialRequest<FriendRecord[]>("/social/friends", {}, "OPERATIVE_OFFLINE // FRIENDS_REQUIRE_ONLINE_UPLINK");
  },

  async sendFriendRequest(identity: string): Promise<FriendRecord> {
    if (isLocalFallbackEnabled() && hasLocalSession()) return sendLocalFriendRequest(identity);
    return socialRequest<FriendRecord>("/social/friends/requests", {
      method: "POST",
      body: JSON.stringify({ identity }),
    }, "OPERATIVE_OFFLINE // FRIEND_REQUESTS_REQUIRE_ONLINE_UPLINK");
  },

  async getProfile(identity: string): Promise<ProfileResponse> {
    if (isLocalFallbackEnabled() && hasLocalSession()) return getLocalProfile(identity);
    try {
      return await socialRequest<ProfileResponse>(`/social/profiles/${encodeURIComponent(identity)}`, {}, "OPERATIVE_OFFLINE // PROFILE_SEARCH_REQUIRES_ONLINE_UPLINK");
    } catch (error) {
      if ((error as Error).message === "Operative not found") {
        throw new Error("USER_NOT_FOUND // CHECK_CALLSIGN_AND_DISCRIMINATOR");
      }
      throw error;
    }
  },

  async challengeFriend(userId: string, roomId: string): Promise<void> {
    if (isLocalFallbackEnabled() && hasLocalSession()) {
      challengeLocalFriend(userId, roomId);
      return;
    }
    await socialRequest<void>(`/social/friends/${encodeURIComponent(userId)}/challenge`, {
      method: "POST",
      body: JSON.stringify({ room_id: roomId }),
    }, "OPERATIVE_OFFLINE // DIRECT_GAMES_REQUIRE_ONLINE_UPLINK");
  },

  async getDirectMessages(userId: string): Promise<DirectMessageRecord[]> {
    if (isLocalFallbackEnabled() && hasLocalSession()) return getLocalDirectMessages(userId);
    return socialRequest<DirectMessageRecord[]>(`/social/messages/${encodeURIComponent(userId)}`, {}, "OPERATIVE_OFFLINE // DIRECT_MESSAGES_REQUIRE_ONLINE_UPLINK");
  },

  async sendDirectMessage(userId: string, body: string): Promise<DirectMessageRecord> {
    if (isLocalFallbackEnabled() && hasLocalSession()) return sendLocalDirectMessage(userId, body);
    return socialRequest<DirectMessageRecord>(`/social/messages/${encodeURIComponent(userId)}`, { method: "POST", body: JSON.stringify({ body }) }, "OPERATIVE_OFFLINE // DIRECT_MESSAGES_REQUIRE_ONLINE_UPLINK");
  },

  async reportUser(userId: string, reason: string): Promise<void> {
    if (isLocalFallbackEnabled() && hasLocalSession()) {
      reportLocalUser(userId, reason);
      return;
    }
    await socialRequest<void>("/social/reports", { method: "POST", body: JSON.stringify({ target_user_id: userId, reason }) }, "OPERATIVE_OFFLINE // REPORTING_REQUIRES_ONLINE_UPLINK");
  },

  async respondToFriendRequest(userId: string, action: "accept" | "decline"): Promise<void> {
    if (isLocalFallbackEnabled() && hasLocalSession()) {
      respondToLocalFriendRequest(userId, action === "accept");
      return;
    }
    await socialRequest<void>(`/social/friends/requests/${encodeURIComponent(userId)}/${action}`, { method: "POST" });
  },

  async removeFriend(userId: string): Promise<void> {
    if (isLocalFallbackEnabled() && hasLocalSession()) {
      removeLocalFriend(userId);
      return;
    }
    await socialRequest<void>(`/social/friends/${encodeURIComponent(userId)}`, { method: "DELETE" });
  },

  async blockUser(userId: string): Promise<void> {
    if (isLocalFallbackEnabled() && hasLocalSession()) {
      blockLocalUser(userId);
      return;
    }
    await socialRequest<void>(`/social/blocks/${encodeURIComponent(userId)}`, { method: "POST" });
  },

  async getBlockedUsers(): Promise<FriendRecord[]> {
    if (isLocalFallbackEnabled() && hasLocalSession()) return getLocalBlockedUsers();
    return socialRequest<FriendRecord[]>("/social/blocks", {}, "OPERATIVE_OFFLINE // BLOCK_LIST_REQUIRES_ONLINE_UPLINK");
  },

  async unblockUser(userId: string): Promise<void> {
    if (isLocalFallbackEnabled() && hasLocalSession()) {
      unblockLocalUser(userId);
      return;
    }
    await socialRequest<void>(`/social/blocks/${encodeURIComponent(userId)}`, { method: "DELETE" });
  },

  async getNotifications(): Promise<NotificationRecord[]> {
    if (isLocalFallbackEnabled() && hasLocalSession()) return getLocalNotifications();
    return socialRequest<NotificationRecord[]>("/social/notifications", {}, "OPERATIVE_OFFLINE // NOTIFICATIONS_REQUIRE_ONLINE_UPLINK");
  },

  async markNotificationRead(notificationId: string): Promise<void> {
    if (isLocalFallbackEnabled() && hasLocalSession()) {
      markLocalNotificationRead(notificationId);
      return;
    }
    await socialRequest<void>(`/social/notifications/${encodeURIComponent(notificationId)}/read`, { method: "POST" });
  },

  async savePushSubscription(subscription: PushSubscription): Promise<void> {
    if (isLocalFallbackEnabled() && hasLocalSession()) return;
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
  // A browser-local account is authoritative for this browser. This lets a
  // user keep testing when the API, Neon, or a hosted deployment is down.
  if (isLocalFallbackEnabled() && path === "/auth/register") {
    return registerLocal(username, password);
  }
  if (isLocalFallbackEnabled() && path === "/auth/login" && hasLocalAccount(username)) {
    return loginLocal(username, password);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });
  } catch {
    if (isLocalFallbackEnabled()) return localAuthRequest(path, username, password);
    throw new Error("OPERATIVE_OFFLINE // ACCOUNT_SERVICE_REQUIRES_ONLINE_UPLINK");
  }

  if (response.ok) return normalizeAuthResponse(await response.json());
  if (response.status >= 500 && isLocalFallbackEnabled()) return localAuthRequest(path, username, password);
  const error = await response.json().catch(() => null);
  throw new Error(error?.detail || "Account request failed");
}

function normalizeAuthResponse(response: AuthResponse): AuthResponse {
  return {
    user: {
      ...response.user,
      // Older development fallback records may predate discriminators.
      discriminator: response.user.discriminator || "0000",
    },
  };
}

function localAuthRequest(path: string, username: string, password: string): Promise<AuthResponse> {
  if (path === "/auth/register") return registerLocal(username, password);
  if (path === "/auth/login") return loginLocal(username, password);
  return Promise.reject(new Error("Account service is temporarily unavailable"));
}

async function socialRequest<T>(path: string, options: RequestInit = {}, offlineMessage = "OPERATIVE_OFFLINE // SOCIAL_FEATURES_REQUIRE_ONLINE_UPLINK"): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
  } catch {
    throw new Error(offlineMessage);
  }
  if (!response.ok) {
    if (response.status >= 500) throw new Error(offlineMessage);
    const error = await response.json().catch(() => null);
    throw new Error(error?.detail || "Social request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

function normalizeEntry(entry: LeaderboardEntry & { timer_mode?: boolean; infinite_mode?: boolean }): LeaderboardEntry {
  return { ...entry, timerMode: entry.timer_mode ?? entry.timerMode ?? false, infiniteMode: entry.infinite_mode ?? entry.infiniteMode ?? false, suspicious: Boolean(entry.suspicious) };
}
