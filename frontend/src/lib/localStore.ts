import type { AccountUser, FriendRecord, NotificationRecord } from "./api";

const ACCOUNTS_KEY = "codebreaker_local_accounts_v1";
const SESSION_KEY = "codebreaker_local_session_v1";
const FRIENDSHIPS_KEY = "codebreaker_local_friendships_v1";
const NOTIFICATIONS_KEY = "codebreaker_local_notifications_v1";
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

function validateCredentials(username: string, password: string): { username: string; password: string } {
  const normalized = normalizeUsername(username);
  if (!/^[A-Z0-9_]{2,24}$/.test(normalized)) {
    throw new Error("CALLSIGN_MUST_USE_2_TO_24_LETTERS_NUMBERS_OR_UNDERSCORES");
  }
  if (password.length < 8 || password.length > 128) {
    throw new Error("PASSWORD_MUST_BE_8_TO_128_CHARACTERS");
  }
  return { username: normalized, password };
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

function findAccount(username: string): LocalAccount | undefined {
  return read<LocalAccount[]>(ACCOUNTS_KEY, []).find((account) => accountKey(account.user.username) === accountKey(username));
}

function currentLocalAccount(): LocalAccount | undefined {
  const session = read<LocalSession | null>(SESSION_KEY, null);
  if (!session) return undefined;
  return read<LocalAccount[]>(ACCOUNTS_KEY, []).find((account) => account.user.user_id === session.userId);
}

function startSession(userId: string): void {
  write<LocalSession>(SESSION_KEY, { userId });
}

export function hasLocalAccount(username: string): boolean {
  return Boolean(findAccount(username));
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
  if (findAccount(credentials.username)) throw new Error("That callsign is already registered locally");
  const user: AccountUser = {
    user_id: `local-${randomId()}`,
    username: credentials.username,
    created_at: new Date().toISOString(),
  };
  const account: LocalAccount = {
    user,
    salt: encode(crypto.getRandomValues(new Uint8Array(16))),
    verifier: "",
  };
  account.verifier = await deriveVerifier(credentials.password, decode(account.salt));
  write(ACCOUNTS_KEY, [...read<LocalAccount[]>(ACCOUNTS_KEY, []), account]);
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

export function logoutLocal(): void {
  storage().removeItem(SESSION_KEY);
}

function orderedIds(first: string, second: string): [string, string] {
  return first < second ? [first, second] : [second, first];
}

function readFriendships(): LocalFriendship[] {
  return read<LocalFriendship[]>(FRIENDSHIPS_KEY, []);
}

function saveFriendships(friendships: LocalFriendship[]): void {
  write(FRIENDSHIPS_KEY, friendships);
}

function readAccounts(): LocalAccount[] {
  return read<LocalAccount[]>(ACCOUNTS_KEY, []);
}

function friendRecord(friendship: LocalFriendship, userId: string): FriendRecord | null {
  const otherId = friendship.userA === userId ? friendship.userB : friendship.userA;
  const other = readAccounts().find((account) => account.user.user_id === otherId);
  if (!other) return null;
  return {
    user_id: other.user.user_id,
    username: other.user.username,
    status: friendship.status,
    direction: friendship.status === "pending" ? (friendship.requestedBy === userId ? "outgoing" : "incoming") : undefined,
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
    .filter((friendship) => friendship.userA === user.user_id || friendship.userB === user.user_id)
    .map((friendship) => friendRecord(friendship, user.user_id))
    .filter((friendship): friendship is FriendRecord => Boolean(friendship));
}

export function sendLocalFriendRequest(username: string): FriendRecord {
  const user = requireLocalUser();
  const target = findAccount(username);
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
  addLocalNotification(target.user.user_id, "friend_request", "New friend request", `${user.username} sent you a friend request.`, { user_id: user.user_id });
  return friendRecord(friendship, user.user_id) as FriendRecord;
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
    if (sender) addLocalNotification(sender.user.user_id, "friend_accepted", "Friend request accepted", `${user.username} accepted your request.`, {});
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
  const [userA, userB] = orderedIds(user.user_id, otherUserId);
  const friendships = readFriendships();
  const now = new Date().toISOString();
  const index = friendships.findIndex((friendship) => friendship.userA === userA && friendship.userB === userB);
  const blocked: LocalFriendship = { userA, userB, status: "blocked", requestedBy: user.user_id, blockedBy: user.user_id, createdAt: now, updatedAt: now };
  if (index === -1) friendships.push(blocked);
  else friendships[index] = blocked;
  saveFriendships(friendships);
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
}
