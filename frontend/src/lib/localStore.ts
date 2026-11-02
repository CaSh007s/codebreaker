import type { AccountUser, FriendRecord, NotificationRecord, ProfileResponse } from "./api";

const ACCOUNTS_KEY = "codebreaker_local_accounts_v1";
const SESSION_KEY = "codebreaker_local_session_v1";
const FRIENDSHIPS_KEY = "codebreaker_local_friendships_v1";
const NOTIFICATIONS_KEY = "codebreaker_local_notifications_v1";
const DIRECT_MESSAGES_KEY = "codebreaker_local_direct_messages_v1";
const REPORTS_KEY = "codebreaker_local_reports_v1";
const PASSWORD_ITERATIONS = 120_000;

interface LocalAccount {
  user: AccountUser;
  salt: string;
  verifier: string;
}

interface LocalSession {
  userId: string;
}

interface LocalFriendship {
  userA: string;
  userB: string;
  status: "pending" | "accepted" | "blocked";
  requestedBy: string;
  blockedBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface LocalDirectMessage {
  message_id: string;
  sender_id: string;
  sender_username: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read: boolean;
}

const DISCRIMINATOR_PATTERN = /^[0-9]{4}$/;

export function isLocalFallbackEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" && window.location.hostname !== "::1" && window.location.hostname !== "[::1]") return false;
  return process.env.NEXT_PUBLIC_ENABLE_LOCAL_FALLBACK !== "false";
}

function storage(): Storage {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error("Browser storage is unavailable");
  }
  return window.localStorage;
}

function read<T>(key: string, fallback: T): T {
  try {
    const value = storage().getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  storage().setItem(key, JSON.stringify(value));
}

function encode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/\s+/g, "_").toUpperCase();
}

function accountKey(username: string): string {
  return normalizeUsername(username).toLowerCase();
}

function splitIdentity(identity: string, requireDiscriminator = false): { username: string; discriminator?: string } {
  const parts = identity.trim().split("#");
  if (parts.length > 2) throw new Error("USE_THE_COMPLETE_HANDLE_LIKE_CALLSIGN#1234");
  const [rawUsername, rawDiscriminator] = parts;
  const username = normalizeUsername(rawUsername);
  if (rawDiscriminator !== undefined && !DISCRIMINATOR_PATTERN.test(rawDiscriminator)) {
    throw new Error("USE_THE_COMPLETE_HANDLE_LIKE_CALLSIGN#1234");
  }
  if (requireDiscriminator && !rawDiscriminator) {
    throw new Error("USE_THE_COMPLETE_HANDLE_LIKE_CALLSIGN#1234");
  }
  return { username, discriminator: rawDiscriminator };
}

function validateCredentials(username: string, password: string): { username: string; password: string } {
  const normalized = validateUsername(username);
  if (password.length < 8 || password.length > 128) {
    throw new Error("PASSWORD_MUST_BE_8_TO_128_CHARACTERS");
  }
  return { username: normalized, password };
}

function validateUsername(username: string): string {
  const normalized = normalizeUsername(username);
  if (!/^[A-Z0-9_]{2,24}$/.test(normalized)) {
    throw new Error("CALLSIGN_MUST_USE_2_TO_24_LETTERS_NUMBERS_OR_UNDERSCORES");
  }
  return normalized;
}

async function deriveVerifier(password: string, salt: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("SECURE_BROWSER_CRYPTO_IS_REQUIRED_FOR_LOCAL_ACCOUNTS");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = new Uint8Array(salt).buffer as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuffer, iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return encode(new Uint8Array(bits));
}

function findAccount(identity: string, requireDiscriminator = false): LocalAccount | undefined {
  const { username, discriminator } = splitIdentity(identity, requireDiscriminator);
  const matches = readAccounts().filter((account) =>
    accountKey(account.user.username) === accountKey(username)
    && (!discriminator || account.user.discriminator === discriminator),
  );
  if (!discriminator && matches.length > 1) {
    throw new Error("MULTIPLE_CALLSIGNS_FOUND_USE_CALLSIGN#1234");
  }
  return matches[0];
}

function currentLocalAccount(): LocalAccount | undefined {
  const session = read<LocalSession | null>(SESSION_KEY, null);
  if (!session) return undefined;
  return readAccounts().find((account) => account.user.user_id === session.userId);
}

function startSession(userId: string): void {
  write<LocalSession>(SESSION_KEY, { userId });
}

export function hasLocalAccount(username: string): boolean {
  try {
    const { username: baseUsername } = splitIdentity(username);
    return readAccounts().some((account) => accountKey(account.user.username) === accountKey(baseUsername));
  } catch {
    return false;
  }
}

export function hasLocalSession(): boolean {
  return Boolean(currentLocalAccount());
}

export function getLocalCurrentAccount(): { user: AccountUser } | null {
  const account = currentLocalAccount();
  return account ? { user: account.user } : null;
}

export async function registerLocal(username: string, password: string): Promise<{ user: AccountUser }> {
  const credentials = validateCredentials(username, password);
  const user: AccountUser = {
    user_id: `local-${randomId()}`,
    username: credentials.username,
    discriminator: generateDiscriminator(credentials.username),
    created_at: new Date().toISOString(),
  };
  const account: LocalAccount = {
    user,
    salt: encode(crypto.getRandomValues(new Uint8Array(16))),
    verifier: "",
  };
  account.verifier = await deriveVerifier(credentials.password, decode(account.salt));
  write(ACCOUNTS_KEY, [...readAccounts(), account]);
  startSession(user.user_id);
  return { user };
}

export async function loginLocal(username: string, password: string): Promise<{ user: AccountUser }> {
  const account = findAccount(username);
  if (!account) throw new Error("Invalid callsign or password");
  const verifier = await deriveVerifier(password, decode(account.salt));
  if (verifier !== account.verifier) throw new Error("Invalid callsign or password");
  startSession(account.user.user_id);
  return { user: account.user };
}

export function updateLocalUsername(username: string): { user: AccountUser } {
  const current = currentLocalAccount();
  if (!current) throw new Error("Sign in before changing your callsign");
  const normalized = validateUsername(username);
  const accounts = readAccounts();
  const used = new Set(accounts
    .filter((account) => account.user.user_id !== current.user.user_id && accountKey(account.user.username) === accountKey(normalized))
    .map((account) => account.user.discriminator));
  const discriminator = used.has(current.user.discriminator) ? nextDiscriminator(used) : current.user.discriminator;
  const updatedUser = { ...current.user, username: normalized, discriminator };
  write(ACCOUNTS_KEY, accounts.map((account) => account.user.user_id === current.user.user_id ? { ...account, user: updatedUser } : account));
  return { user: updatedUser };
}

export function updateLocalAvatar(avatarUrl: string): { user: AccountUser } {
  const current = currentLocalAccount();
  if (!current) throw new Error("Sign in before changing your avatar");
  const updatedUser = { ...current.user, avatar_url: avatarUrl };
  write(ACCOUNTS_KEY, readAccounts().map((account) => account.user.user_id === current.user.user_id ? { ...account, user: updatedUser } : account));
  return { user: updatedUser };
}

export function logoutLocal(): void {
  storage().removeItem(SESSION_KEY);
}

function orderedIds(first: string, second: string): [string, string] {
  return first < second ? [first, second] : [second, first];
}

function generateDiscriminator(username: string): string {
  const existing = new Set(
    readStoredAccounts()
      .filter((account) => accountKey(account.user.username) === accountKey(username))
      .map((account) => account.user.discriminator),
  );
  let discriminator = "";
  do {
    discriminator = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  } while (existing.has(discriminator));
  return discriminator;
}

function nextDiscriminator(used: Set<string>): string {
  if (used.size >= 10000) throw new Error("THIS_CALLSIGN_HAS_USED_EVERY_DISCRIMINATOR_CHOOSE_ANOTHER_NAME");
  const start = Math.floor(Math.random() * 10000);
  for (let offset = 0; offset < 10000; offset += 1) {
    const candidate = String((start + offset) % 10000).padStart(4, "0");
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("THIS_CALLSIGN_HAS_USED_EVERY_DISCRIMINATOR_CHOOSE_ANOTHER_NAME");
}

function readFriendships(): LocalFriendship[] {
  return read<LocalFriendship[]>(FRIENDSHIPS_KEY, []);
}

function saveFriendships(friendships: LocalFriendship[]): void {
  write(FRIENDSHIPS_KEY, friendships);
}

function readStoredAccounts(): LocalAccount[] {
  return read<LocalAccount[]>(ACCOUNTS_KEY, []);
}

function readAccounts(): LocalAccount[] {
  const stored = readStoredAccounts();
  const used = new Map<string, Set<string>>();
  let changed = false;
  const accounts = stored.map((account) => {
    const key = accountKey(account.user.username);
    const usedDiscriminators = used.get(key) ?? new Set<string>();
    let discriminator = account.user.discriminator;
    if (!DISCRIMINATOR_PATTERN.test(discriminator || "") || usedDiscriminators.has(discriminator)) {
      do {
        discriminator = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
      } while (usedDiscriminators.has(discriminator));
      changed = true;
    }
    usedDiscriminators.add(discriminator);
    used.set(key, usedDiscriminators);
    if (account.user.discriminator === discriminator) return account;
    return { ...account, user: { ...account.user, discriminator } };
  });
  if (changed) write(ACCOUNTS_KEY, accounts);
  return accounts;
}

function friendRecord(friendship: LocalFriendship, userId: string): FriendRecord | null {
  const otherId = friendship.userA === userId ? friendship.userB : friendship.userA;
  const other = readAccounts().find((account) => account.user.user_id === otherId);
  if (!other) return null;
  return {
    user_id: other.user.user_id,
    username: other.user.username,
    discriminator: other.user.discriminator,
    status: friendship.status,
    direction: friendship.status === "pending" ? (friendship.requestedBy === userId ? "outgoing" : "incoming") : undefined,
    blocked_by: friendship.blockedBy,
    created_at: friendship.createdAt,
  };
}

function requireLocalUser(): AccountUser {
  const account = currentLocalAccount();
  if (!account) throw new Error("Sign in to use local social features");
  return account.user;
}

function addLocalNotification(recipientId: string, kind: string, title: string, body: string, payload: Record<string, string>): void {
  const notification: NotificationRecord = {
    notification_id: `local-notification-${randomId()}`,
    kind,
    title,
    body,
    payload,
    read: false,
    created_at: new Date().toISOString(),
  };
  write(NOTIFICATIONS_KEY, [...read<NotificationRecord[]>(NOTIFICATIONS_KEY, []), { ...notification, recipient_id: recipientId }]);
}

export function getLocalFriends(): FriendRecord[] {
  const user = requireLocalUser();
  return readFriendships()
    .filter((friendship) => (friendship.userA === user.user_id || friendship.userB === user.user_id) && friendship.status !== "blocked")
    .map((friendship) => friendRecord(friendship, user.user_id))
    .filter((friendship): friendship is FriendRecord => Boolean(friendship));
}

export function getLocalBlockedUsers(): FriendRecord[] {
  const user = requireLocalUser();
  return readFriendships()
    .filter((friendship) => friendship.status === "blocked" && friendship.blockedBy === user.user_id)
    .map((friendship) => friendRecord(friendship, user.user_id))
    .filter((friendship): friendship is FriendRecord => Boolean(friendship));
}

export function getLocalProfile(identity: string): ProfileResponse {
  const viewer = requireLocalUser();
  const target = findAccount(identity, true);
  if (!target) throw new Error("USER_NOT_FOUND // CHECK_CALLSIGN_AND_DISCRIMINATOR");
  const friendships = readFriendships();
  const [userA, userB] = orderedIds(viewer.user_id, target.user.user_id);
  const friendship = friendships.find((item) => item.userA === userA && item.userB === userB);
  if (friendship?.status === "blocked" && friendship.blockedBy !== viewer.user_id) throw new Error("PROFILE_UNAVAILABLE // OPERATIVE_BLOCKED");
  const friendCount = friendships.filter((item) => item.status === "accepted" && (item.userA === target.user.user_id || item.userB === target.user.user_id)).length;
  const localScores = read<{ username: string; status: string; score: number }[]>("codebreaker_leaderboard", []);
  const records = localScores.filter((entry) => entry.username.toLowerCase() === target.user.username.toLowerCase());
  return {
    ...target.user,
    friend_count: friendCount,
    friendship_status: friendship ? (friendship.status === "pending" ? (friendship.requestedBy === viewer.user_id ? "pending_outgoing" : "pending_incoming") : friendship.status) : null,
    is_self: target.user.user_id === viewer.user_id,
    records: {
      games_played: records.length,
      wins: records.filter((entry) => entry.status === "solved").length,
      losses: records.filter((entry) => entry.status !== "solved").length,
      best_score: records.reduce((best, entry) => Math.max(best, entry.score || 0), 0),
    },
  };
}

export function sendLocalFriendRequest(identity: string): FriendRecord {
  const user = requireLocalUser();
  const target = findAccount(identity, true);
  if (!target || target.user.user_id === user.user_id) throw new Error("Operative not found locally");
  const [userA, userB] = orderedIds(user.user_id, target.user.user_id);
  const friendships = readFriendships();
  const existing = friendships.find((friendship) => friendship.userA === userA && friendship.userB === userB);
  if (existing) {
    if (existing.status === "accepted") throw new Error("You are already friends");
    if (existing.status === "blocked") throw new Error("This operative cannot receive a request");
    throw new Error("A friend request already exists");
  }
  const now = new Date().toISOString();
  const friendship: LocalFriendship = { userA, userB, status: "pending", requestedBy: user.user_id, createdAt: now, updatedAt: now };
  saveFriendships([...friendships, friendship]);
  const identityValue = `${user.username}#${user.discriminator}`;
  addLocalNotification(target.user.user_id, "friend_request", "New friend request", `${identityValue} sent you a friend request.`, { user_id: user.user_id, identity: identityValue });
  return friendRecord(friendship, user.user_id) as FriendRecord;
}

export function challengeLocalFriend(otherUserId: string, roomId: string): void {
  const user = requireLocalUser();
  const friendship = readFriendships().find((item) => item.status === "accepted" && ((item.userA === user.user_id && item.userB === otherUserId) || (item.userA === otherUserId && item.userB === user.user_id)));
  if (!friendship) throw new Error("You must be friends before starting a direct game");
  addLocalNotification(otherUserId, "game_invite", "Direct game invite", `${user.username}#${user.discriminator} opened a direct game with you.`, { room_id: roomId, mode: "standard", level: "4", repeats: "false" });
}

export function getLocalDirectMessages(otherUserId: string): LocalDirectMessage[] {
  const user = requireLocalUser();
  const blocked = readFriendships().some((item) => item.status === "blocked" && ((item.userA === user.user_id && item.userB === otherUserId) || (item.userA === otherUserId && item.userB === user.user_id)));
  if (blocked) throw new Error("MESSAGING_BLOCKED // OPERATIVE_UNAVAILABLE");
  return read<LocalDirectMessage[]>(DIRECT_MESSAGES_KEY, []).filter((message) => (message.sender_id === user.user_id && message.recipient_id === otherUserId) || (message.sender_id === otherUserId && message.recipient_id === user.user_id)).map((message) => message.recipient_id === user.user_id ? { ...message, read: true } : message);
}

export function sendLocalDirectMessage(otherUserId: string, body: string): LocalDirectMessage {
  const user = requireLocalUser();
  const friendship = readFriendships().find((item) => item.status === "accepted" && ((item.userA === user.user_id && item.userB === otherUserId) || (item.userA === otherUserId && item.userB === user.user_id)));
  if (!friendship) throw new Error("You must be friends before sending direct messages");
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 2000) throw new Error("Message must contain 1 to 2000 characters");
  const message: LocalDirectMessage = { message_id: `local-message-${randomId()}`, sender_id: user.user_id, sender_username: user.username, recipient_id: otherUserId, body: trimmed, created_at: new Date().toISOString(), read: true };
  write(DIRECT_MESSAGES_KEY, [...read<LocalDirectMessage[]>(DIRECT_MESSAGES_KEY, []), message]);
  return message;
}

export function reportLocalUser(targetUserId: string, reason: string): void {
  const user = requireLocalUser();
  if (user.user_id === targetUserId) throw new Error("You cannot report yourself");
  const target = readAccounts().find((account) => account.user.user_id === targetUserId);
  if (!target) throw new Error("Operative not found locally");
  const trimmed = reason.trim();
  if (trimmed.length < 3 || trimmed.length > 500) throw new Error("REPORT_REASON_MUST_BE_3_TO_500_CHARACTERS");
  write(REPORTS_KEY, [...read<{ id: string; reporter_id: string; target_user_id: string; reason: string; created_at: string }[]>(REPORTS_KEY, []), {
    id: `local-report-${randomId()}`,
    reporter_id: user.user_id,
    target_user_id: targetUserId,
    reason: trimmed,
    created_at: new Date().toISOString(),
  }]);
}

export function respondToLocalFriendRequest(otherUserId: string, accept: boolean): void {
  const user = requireLocalUser();
  const [userA, userB] = orderedIds(user.user_id, otherUserId);
  const friendships = readFriendships();
  const index = friendships.findIndex((friendship) => friendship.userA === userA && friendship.userB === userB);
  const friendship = friendships[index];
  if (!friendship || friendship.status !== "pending" || friendship.requestedBy === user.user_id) throw new Error("Friend request is not available");
  if (accept) {
    friendships[index] = { ...friendship, status: "accepted", updatedAt: new Date().toISOString() };
    const sender = readAccounts().find((account) => account.user.user_id === otherUserId);
    if (sender) {
      const identityValue = `${user.username}#${user.discriminator}`;
      addLocalNotification(sender.user.user_id, "friend_accepted", "Friend request accepted", `${identityValue} accepted your friend request.`, { user_id: user.user_id, identity: identityValue });
    }
  } else {
    friendships.splice(index, 1);
  }
  saveFriendships(friendships);
}

export function removeLocalFriend(otherUserId: string): void {
  const user = requireLocalUser();
  const [userA, userB] = orderedIds(user.user_id, otherUserId);
  saveFriendships(readFriendships().filter((friendship) => !(friendship.userA === userA && friendship.userB === userB && friendship.status === "accepted")));
}

export function blockLocalUser(otherUserId: string): void {
  const user = requireLocalUser();
  if (user.user_id === otherUserId) throw new Error("You cannot block yourself");
  if (!readAccounts().some((account) => account.user.user_id === otherUserId)) throw new Error("Operative not found");
  const [userA, userB] = orderedIds(user.user_id, otherUserId);
  const friendships = readFriendships();
  const now = new Date().toISOString();
  const index = friendships.findIndex((friendship) => friendship.userA === userA && friendship.userB === userB);
  const blocked: LocalFriendship = { userA, userB, status: "blocked", requestedBy: user.user_id, blockedBy: user.user_id, createdAt: now, updatedAt: now };
  if (index === -1) friendships.push(blocked);
  else friendships[index] = blocked;
  saveFriendships(friendships);
}

export function unblockLocalUser(otherUserId: string): void {
  const user = requireLocalUser();
  const [userA, userB] = orderedIds(user.user_id, otherUserId);
  saveFriendships(readFriendships().filter((friendship) => !(
    friendship.userA === userA
    && friendship.userB === userB
    && friendship.status === "blocked"
    && friendship.blockedBy === user.user_id
  )));
}

export function getLocalNotifications(): NotificationRecord[] {
  const user = requireLocalUser();
  return read<(NotificationRecord & { recipient_id: string })[]>(NOTIFICATIONS_KEY, [])
    .filter((notification) => notification.recipient_id === user.user_id)
    .map((notification): NotificationRecord => ({
      notification_id: notification.notification_id,
      kind: notification.kind,
      title: notification.title,
      body: notification.body,
      payload: notification.payload,
      read: notification.read,
      created_at: notification.created_at,
    }))
    .sort((first, second) => second.created_at.localeCompare(first.created_at));
}

export function markLocalNotificationRead(notificationId: string): void {
  const user = requireLocalUser();
  const notifications = read<(NotificationRecord & { recipient_id: string })[]>(NOTIFICATIONS_KEY, []);
  write(NOTIFICATIONS_KEY, notifications.map((notification) => notification.recipient_id === user.user_id && notification.notification_id === notificationId ? { ...notification, read: true } : notification));
}

export function clearLocalAccountData(): void {
  storage().removeItem(ACCOUNTS_KEY);
  storage().removeItem(SESSION_KEY);
  storage().removeItem(FRIENDSHIPS_KEY);
  storage().removeItem(NOTIFICATIONS_KEY);
  storage().removeItem(DIRECT_MESSAGES_KEY);
  storage().removeItem(REPORTS_KEY);
}
