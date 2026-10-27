"""Neon-backed accounts and cookie-session storage."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import asyncpg
from dotenv import load_dotenv

try:
    from pywebpush import WebPushException, webpush
except ImportError:  # Optional until push credentials are configured.
    WebPushException = Exception  # type: ignore[misc,assignment]
    webpush = None

load_dotenv()

logger = logging.getLogger(__name__)
SESSION_TTL_SECONDS = 60 * 60 * 24 * 30


class AccountUnavailableError(RuntimeError):
    pass


class UsernameTakenError(ValueError):
    pass


class InvalidCredentialsError(ValueError):
    pass


def hash_password(password: str) -> str:
    """Hash a password with scrypt and a per-password random salt."""
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=64)
    encode = lambda value: base64.urlsafe_b64encode(value).decode("ascii")
    return f"scrypt$16384$8$1${encode(salt)}${encode(derived)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt_value, digest_value = encoded.split("$")
        if algorithm != "scrypt":
            return False
        salt = base64.urlsafe_b64decode(salt_value.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_value.encode("ascii"))
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


class AccountService:
    def __init__(self) -> None:
        self.pool: asyncpg.Pool | None = None
        self.session_secret = os.getenv("SESSION_SECRET", "")
        self.fallback_path = Path(os.getenv("FALLBACK_ACCOUNT_STORE", "./data/accounts.json")).expanduser()
        self.fallback_accounts: dict[str, dict[str, Any]] = {}
        self.fallback_sessions: dict[str, dict[str, Any]] = {}

    @property
    def configured(self) -> bool:
        return bool(self.session_secret and (self.pool or self.fallback_path))

    async def initialize(self) -> None:
        database_url = os.getenv("DATABASE_URL", "").strip()
        self.session_secret = os.getenv("SESSION_SECRET", "").strip()
        self.fallback_path = Path(os.getenv("FALLBACK_ACCOUNT_STORE", "./data/accounts.json")).expanduser()
        self._load_fallback()
        if not database_url or not self.session_secret:
            logger.info("Neon account storage is not configured; guest mode remains available")
            return
        try:
            self.pool = await asyncpg.create_pool(database_url, min_size=1, max_size=5, command_timeout=10)
            await self.pool.execute(
                """
                CREATE TABLE IF NOT EXISTS cb_users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    username_key TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS cb_sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES cb_users(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    expires_at TIMESTAMPTZ NOT NULL
                );
                CREATE INDEX IF NOT EXISTS cb_sessions_user_idx ON cb_sessions(user_id);
                CREATE INDEX IF NOT EXISTS cb_sessions_expiry_idx ON cb_sessions(expires_at);
                CREATE TABLE IF NOT EXISTS cb_friendships (
                    user_a TEXT NOT NULL REFERENCES cb_users(id) ON DELETE CASCADE,
                    user_b TEXT NOT NULL REFERENCES cb_users(id) ON DELETE CASCADE,
                    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')),
                    requested_by TEXT NOT NULL REFERENCES cb_users(id) ON DELETE CASCADE,
                    blocked_by TEXT REFERENCES cb_users(id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (user_a, user_b),
                    CHECK (user_a < user_b)
                );
                CREATE INDEX IF NOT EXISTS cb_friendships_user_a_idx ON cb_friendships(user_a);
                CREATE INDEX IF NOT EXISTS cb_friendships_user_b_idx ON cb_friendships(user_b);
                CREATE TABLE IF NOT EXISTS cb_notifications (
                    id TEXT PRIMARY KEY,
                    recipient_id TEXT NOT NULL REFERENCES cb_users(id) ON DELETE CASCADE,
                    kind TEXT NOT NULL,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    read_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS cb_notifications_recipient_idx ON cb_notifications(recipient_id, created_at DESC);
                CREATE TABLE IF NOT EXISTS cb_push_subscriptions (
                    endpoint TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES cb_users(id) ON DELETE CASCADE,
                    p256dh TEXT NOT NULL,
                    auth TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
        except Exception:
            logger.exception("Account storage could not be initialized")
            if self.pool:
                await self.pool.close()
            self.pool = None

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()
            self.pool = None

    def _load_fallback(self) -> None:
        try:
            raw = json.loads(self.fallback_path.read_text())
            self.fallback_accounts = raw.get("accounts", {})
            self.fallback_sessions = raw.get("sessions", {})
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            self.fallback_accounts = {}
            self.fallback_sessions = {}

    def _save_fallback(self) -> None:
        try:
            self.fallback_path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.fallback_path.with_suffix(".tmp")
            temporary.write_text(json.dumps({"accounts": self.fallback_accounts, "sessions": self.fallback_sessions}))
            temporary.chmod(0o600)
            temporary.replace(self.fallback_path)
            self.fallback_path.chmod(0o600)
        except OSError:
            logger.exception("Could not save emergency account fallback store")

    def _account_user(self, account: dict[str, Any]) -> dict[str, Any]:
        return {"user_id": account["id"], "username": account["username"], "created_at": account["created_at"]}

    def _fallback_register(self, username: str, password: str) -> tuple[dict[str, Any], str]:
        username_key = username.casefold()
        if username_key in self.fallback_accounts:
            raise UsernameTakenError("That callsign is already registered")
        account = {
            "id": secrets.token_hex(16),
            "username": username,
            "password_hash": hash_password(password),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self.fallback_accounts[username_key] = account
        self._save_fallback()
        return self._account_user(account), self._fallback_create_session(account["id"])

    def _mirror_fallback_account(self, user_id: str, username: str, password_hash: str, created_at: Any) -> None:
        self.fallback_accounts[username.casefold()] = {
            "id": user_id,
            "username": username,
            "password_hash": password_hash,
            "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
        }
        self._save_fallback()

    def _fallback_create_session(self, user_id: str) -> str:
        token = secrets.token_urlsafe(48)
        self.fallback_sessions[self._token_hash(token)] = {
            "user_id": user_id,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        }
        self._save_fallback()
        return token

    def _fallback_login(self, username: str, password: str) -> tuple[dict[str, Any], str]:
        account = self.fallback_accounts.get(username.casefold())
        if not account or not verify_password(password, account["password_hash"]):
            raise InvalidCredentialsError("Invalid callsign or password")
        return self._account_user(account), self._fallback_create_session(account["id"])

    def _fallback_user(self, token: str | None) -> dict[str, Any] | None:
        if not token:
            return None
        session = self.fallback_sessions.get(self._token_hash(token))
        if not session:
            return None
        if datetime.fromisoformat(session["expires_at"]) <= datetime.now(timezone.utc):
            return None
        return next((self._account_user(account) for account in self.fallback_accounts.values() if account["id"] == session["user_id"]), None)

    def _require_storage(self) -> asyncpg.Pool:
        if not self.pool:
            raise AccountUnavailableError("Persistent social storage is unavailable")
        return self.pool

    def _token_hash(self, token: str) -> str:
        return hmac.new(self.session_secret.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()

    @staticmethod
    def _user(row: asyncpg.Record) -> dict[str, Any]:
        return {
            "user_id": row["id"],
            "username": row["username"],
            "created_at": row["created_at"].isoformat(),
        }

    async def register(self, username: str, password: str) -> tuple[dict[str, Any], str]:
        if not self.session_secret:
            raise AccountUnavailableError("Account service is not configured")
        if not self.pool:
            return self._fallback_register(username, password)
        pool = self.pool
        username_key = username.casefold()
        user_id = secrets.token_hex(16)
        password_hash = hash_password(password)
        try:
            row = await pool.fetchrow(
                """
                INSERT INTO cb_users (id, username, username_key, password_hash)
                VALUES ($1, $2, $3, $4)
                RETURNING id, username, created_at
                """,
                user_id,
                username,
                username_key,
                password_hash,
            )
        except asyncpg.UniqueViolationError as exc:
            raise UsernameTakenError("That callsign is already registered") from exc
        except Exception:
            logger.warning("Neon registration failed; using emergency account fallback", exc_info=True)
            self.pool = None
            return self._fallback_register(username, password)
        self._mirror_fallback_account(row["id"], row["username"], password_hash, row["created_at"])
        return self._user(row), await self._create_session(user_id)

    async def login(self, username: str, password: str) -> tuple[dict[str, Any], str]:
        if not self.session_secret:
            raise AccountUnavailableError("Account service is not configured")
        if not self.pool:
            return self._fallback_login(username, password)
        pool = self.pool
        try:
            row = await pool.fetchrow(
                "SELECT id, username, password_hash, created_at FROM cb_users WHERE username_key = $1",
                username.casefold(),
            )
        except Exception:
            logger.warning("Neon login failed; using emergency account fallback", exc_info=True)
            self.pool = None
            return self._fallback_login(username, password)
        if not row or not verify_password(password, row["password_hash"]):
            raise InvalidCredentialsError("Invalid callsign or password")
        self._mirror_fallback_account(row["id"], row["username"], row["password_hash"], row["created_at"])
        return self._user(row), await self._create_session(row["id"])

    async def _create_session(self, user_id: str) -> str:
        if not self.pool:
            return self._fallback_create_session(user_id)
        pool = self.pool
        token = secrets.token_urlsafe(48)
        await pool.execute(
            "INSERT INTO cb_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')",
            self._token_hash(token),
            user_id,
        )
        return token

    async def get_user(self, token: str | None) -> dict[str, Any] | None:
        if not token:
            return None
        if not self.session_secret:
            raise AccountUnavailableError("Account service is not configured")
        if not self.pool:
            return self._fallback_user(token)
        pool = self.pool
        try:
            row = await pool.fetchrow(
                """
                SELECT u.id, u.username, u.created_at
                FROM cb_sessions s JOIN cb_users u ON u.id = s.user_id
                WHERE s.token_hash = $1 AND s.expires_at > NOW()
                """,
                self._token_hash(token),
            )
        except Exception:
            logger.warning("Neon session lookup failed; using emergency account fallback", exc_info=True)
            self.pool = None
            return self._fallback_user(token)
        return self._user(row) if row else None

    async def delete_session(self, token: str | None) -> None:
        if not token or not self.session_secret:
            return
        if self.pool:
            await self.pool.execute("DELETE FROM cb_sessions WHERE token_hash = $1", self._token_hash(token))
        else:
            self.fallback_sessions.pop(self._token_hash(token), None)
            self._save_fallback()

    @staticmethod
    def _ordered_users(first: str, second: str) -> tuple[str, str]:
        return (first, second) if first < second else (second, first)

    @staticmethod
    def _friend(row: asyncpg.Record, current_user_id: str) -> dict[str, Any]:
        other_id = row["user_b"] if row["user_a"] == current_user_id else row["user_a"]
        direction = None
        if row["status"] == "pending":
            direction = "outgoing" if row["requested_by"] == current_user_id else "incoming"
        return {
            "user_id": other_id,
            "username": row["other_username"],
            "status": row["status"],
            "direction": direction,
            "created_at": row["created_at"].isoformat(),
        }

    async def find_user(self, username: str, current_user_id: str) -> dict[str, Any] | None:
        pool = self._require_storage()
        row = await pool.fetchrow(
            "SELECT id, username, created_at FROM cb_users WHERE username_key = $1 AND id <> $2",
            username.casefold(), current_user_id,
        )
        return self._user(row) if row else None

    async def list_friends(self, user_id: str) -> list[dict[str, Any]]:
        pool = self._require_storage()
        rows = await pool.fetch(
            """
            SELECT f.*, u.username AS other_username
            FROM cb_friendships f
            JOIN cb_users u ON u.id = CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END
            WHERE f.user_a = $1 OR f.user_b = $1
            ORDER BY f.updated_at DESC
            """, user_id,
        )
        return [self._friend(row, user_id) for row in rows]

    async def send_friend_request(self, requester_id: str, username: str) -> dict[str, Any]:
        pool = self._require_storage()
        target = await self.find_user(username, requester_id)
        if not target:
            raise ValueError("Operative not found")
        target_id = target["user_id"]
        user_a, user_b = self._ordered_users(requester_id, target_id)
        existing = await pool.fetchrow(
            "SELECT status, requested_by FROM cb_friendships WHERE user_a = $1 AND user_b = $2",
            user_a, user_b,
        )
        if existing:
            if existing["status"] == "blocked":
                raise ValueError("This operative cannot receive a request")
            if existing["status"] == "accepted":
                raise ValueError("You are already friends")
            raise ValueError("A friend request already exists")
        await pool.execute(
            "INSERT INTO cb_friendships (user_a, user_b, status, requested_by) VALUES ($1, $2, 'pending', $3)",
            user_a, user_b, requester_id,
        )
        await self.create_notification(
            target_id, "friend_request", "New friend request", f"{target['username']} sent you a friend request.",
            {"user_id": requester_id},
        )
        return {"user_id": target_id, "username": target["username"], "status": "pending", "direction": "outgoing"}

    async def respond_friend_request(self, user_id: str, other_user_id: str, accept: bool) -> None:
        pool = self._require_storage()
        user_a, user_b = self._ordered_users(user_id, other_user_id)
        row = await pool.fetchrow(
            "SELECT status, requested_by FROM cb_friendships WHERE user_a = $1 AND user_b = $2",
            user_a, user_b,
        )
        if not row or row["status"] != "pending" or row["requested_by"] == user_id:
            raise ValueError("Friend request is not available")
        if accept:
            await pool.execute(
                "UPDATE cb_friendships SET status = 'accepted', updated_at = NOW() WHERE user_a = $1 AND user_b = $2",
                user_a, user_b,
            )
            sender = await pool.fetchrow("SELECT username FROM cb_users WHERE id = $1", other_user_id)
            await self.create_notification(
                other_user_id, "friend_accepted", "Friend request accepted", f"{sender['username']} accepted your request.", {},
            )
        else:
            await pool.execute("DELETE FROM cb_friendships WHERE user_a = $1 AND user_b = $2", user_a, user_b)

    async def remove_friend(self, user_id: str, other_user_id: str) -> None:
        pool = self._require_storage()
        user_a, user_b = self._ordered_users(user_id, other_user_id)
        await pool.execute(
            "DELETE FROM cb_friendships WHERE user_a = $1 AND user_b = $2 AND status = 'accepted'",
            user_a, user_b,
        )

    async def block_user(self, user_id: str, other_user_id: str) -> None:
        pool = self._require_storage()
        user_a, user_b = self._ordered_users(user_id, other_user_id)
        await pool.execute(
            """
            INSERT INTO cb_friendships (user_a, user_b, status, requested_by, blocked_by)
            VALUES ($1, $2, 'blocked', $3, $3)
            ON CONFLICT (user_a, user_b) DO UPDATE SET status = 'blocked', blocked_by = $3, updated_at = NOW()
            """, user_a, user_b, user_id,
        )

    async def create_notification(self, recipient_id: str, kind: str, title: str, body: str, payload: dict[str, Any]) -> None:
        pool = self._require_storage()
        notification_id = str(uuid.uuid4())
        await pool.execute(
            "INSERT INTO cb_notifications (id, recipient_id, kind, title, body, payload) VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
            notification_id, recipient_id, kind, title, body, json.dumps(payload),
        )
        await self.send_push(recipient_id, title, body, {**payload, "notification_id": notification_id})

    async def list_notifications(self, user_id: str, limit: int = 30) -> list[dict[str, Any]]:
        pool = self._require_storage()
        rows = await pool.fetch(
            "SELECT id, kind, title, body, payload, read_at, created_at FROM cb_notifications WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT $2",
            user_id, min(limit, 100),
        )
        return [
            {"notification_id": row["id"], "kind": row["kind"], "title": row["title"], "body": row["body"], "payload": row["payload"], "read": row["read_at"] is not None, "created_at": row["created_at"].isoformat()}
            for row in rows
        ]

    async def mark_notification_read(self, user_id: str, notification_id: str) -> None:
        pool = self._require_storage()
        await pool.execute("UPDATE cb_notifications SET read_at = NOW() WHERE id = $1 AND recipient_id = $2", notification_id, user_id)

    async def save_push_subscription(self, user_id: str, endpoint: str, p256dh: str, auth: str) -> None:
        pool = self._require_storage()
        await pool.execute(
            """
            INSERT INTO cb_push_subscriptions (endpoint, user_id, p256dh, auth)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, p256dh = $3, auth = $4
            """, endpoint, user_id, p256dh, auth,
        )

    async def send_push(self, user_id: str, title: str, body: str, data: dict[str, Any]) -> None:
        vapid_private_key = os.getenv("VAPID_PRIVATE_KEY", "").strip()
        vapid_subject = os.getenv("VAPID_SUBJECT", "").strip()
        if not webpush or not vapid_private_key or not vapid_subject:
            return
        pool = self._require_storage()
        subscriptions = await pool.fetch("SELECT endpoint, p256dh, auth FROM cb_push_subscriptions WHERE user_id = $1", user_id)
        for subscription in subscriptions:
            try:
                webpush(
                    subscription_info={"endpoint": subscription["endpoint"], "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]}},
                    data=json.dumps({"title": title, "body": body, "data": data}),
                    vapid_private_key=vapid_private_key,
                    vapid_claims={"sub": vapid_subject},
                )
            except WebPushException:
                logger.warning("Could not deliver push notification", exc_info=True)


account_service = AccountService()
