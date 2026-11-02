"""Neon-backed accounts and cookie-session storage."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import re
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
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{2,24}$")
DISCRIMINATOR_PATTERN = re.compile(r"^[0-9]{4}$")


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


def normalize_username(username: str) -> str:
    normalized = username.strip().replace(" ", "_")
    if not USERNAME_PATTERN.fullmatch(normalized):
        raise ValueError("Callsigns must use 2 to 24 letters, numbers, or underscores")
    return normalized


def split_identity(identity: str, *, require_discriminator: bool = False) -> tuple[str, str | None]:
    value = identity.strip()
    if "#" in value:
        username, discriminator = value.rsplit("#", 1)
        username = normalize_username(username)
        if not DISCRIMINATOR_PATTERN.fullmatch(discriminator):
            raise ValueError("Use a four-digit discriminator, for example CALLSIGN#1234")
        return username, discriminator
    username = normalize_username(value)
    if require_discriminator:
        raise ValueError("Use the complete handle, for example CALLSIGN#1234")
    return username, None


def generate_discriminator() -> str:
    return f"{secrets.randbelow(9000) + 1000:04d}"


class AccountService:
    def __init__(self) -> None:
        self.pool: asyncpg.Pool | None = None
        self.session_secret = os.getenv("SESSION_SECRET", "")
        fallback_path = os.getenv("FALLBACK_ACCOUNT_STORE", "").strip()
        self.fallback_path: Path | None = Path(fallback_path).expanduser() if fallback_path else None
        self.fallback_accounts: dict[str, dict[str, Any]] = {}
        self.fallback_sessions: dict[str, dict[str, Any]] = {}

    @property
    def configured(self) -> bool:
        return bool(self.session_secret)

    async def initialize(self) -> None:
        database_url = os.getenv("DATABASE_URL", "").strip()
        self.session_secret = os.getenv("SESSION_SECRET", "").strip()
        fallback_path = os.getenv("FALLBACK_ACCOUNT_STORE", "").strip()
        self.fallback_path = Path(fallback_path).expanduser() if fallback_path else None
        self._load_fallback()
        if not database_url or not self.session_secret:
            logger.info("Neon account storage is not configured; guest mode remains available")
            return
        if self.fallback_path is None:
            logger.info("Server file account fallback is disabled; Neon remains the production account store")
        try:
            self.pool = await asyncpg.create_pool(database_url, min_size=1, max_size=5, command_timeout=10)
            await self.pool.execute(
                """
                CREATE TABLE IF NOT EXISTS cb_users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    username_key TEXT NOT NULL,
                    discriminator TEXT NOT NULL DEFAULT '0000',
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                ALTER TABLE cb_users ADD COLUMN IF NOT EXISTS discriminator TEXT;
                UPDATE cb_users
                SET discriminator = LPAD((1000 + MOD(ABS(hashtext(id)::bigint), 9000))::text, 4, '0')
                WHERE discriminator IS NULL OR discriminator = '';
                ALTER TABLE cb_users ALTER COLUMN discriminator SET DEFAULT '0000';
                ALTER TABLE cb_users ALTER COLUMN discriminator SET NOT NULL;
                DO $$
                DECLARE old_constraint TEXT;
                BEGIN
                    SELECT conname INTO old_constraint
                    FROM pg_constraint
                    WHERE conrelid = 'cb_users'::regclass
                      AND contype = 'u'
                      AND pg_get_constraintdef(oid) = 'UNIQUE (username_key)';
                    IF old_constraint IS NOT NULL THEN
                        EXECUTE format('ALTER TABLE cb_users DROP CONSTRAINT %I', old_constraint);
                    END IF;
                END $$;
                CREATE UNIQUE INDEX IF NOT EXISTS cb_users_identity_idx ON cb_users(username_key, discriminator);
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
        if self.fallback_path is None:
            self.fallback_accounts = {}
            self.fallback_sessions = {}
            return
        try:
            raw = json.loads(self.fallback_path.read_text())
            accounts: dict[str, dict[str, Any]] = {}
            for account in raw.get("accounts", {}).values():
                account = dict(account)
                account["username"] = account.get("username", "").strip()
                account["discriminator"] = account.get("discriminator") or generate_discriminator()
                accounts[f"{account['username'].casefold()}#{account['discriminator']}"] = account
            self.fallback_accounts = accounts
            self.fallback_sessions = raw.get("sessions", {})
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            self.fallback_accounts = {}
            self.fallback_sessions = {}

    def _save_fallback(self) -> None:
        if self.fallback_path is None:
            return
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
        return {
            "user_id": account["id"],
            "username": account["username"],
            "discriminator": account["discriminator"],
            "created_at": account["created_at"],
        }

    def _fallback_register(self, username: str, password: str) -> tuple[dict[str, Any], str]:
        username = normalize_username(username)
        discriminator = generate_discriminator()
        while f"{username.casefold()}#{discriminator}" in self.fallback_accounts:
            discriminator = generate_discriminator()
        account = {
            "id": secrets.token_hex(16),
            "username": username,
            "discriminator": discriminator,
            "password_hash": hash_password(password),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self.fallback_accounts[f"{username.casefold()}#{discriminator}"] = account
        self._save_fallback()
        return self._account_user(account), self._fallback_create_session(account["id"])

    def _mirror_fallback_account(self, user_id: str, username: str, discriminator: str, password_hash: str, created_at: Any) -> None:
        self.fallback_accounts = {
            key: account for key, account in self.fallback_accounts.items() if account.get("id") != user_id
        }
        self.fallback_accounts[f"{username.casefold()}#{discriminator}"] = {
            "id": user_id,
            "username": username,
            "discriminator": discriminator,
            "password_hash": password_hash,
            "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
        }
        self._save_fallback()

    async def update_username(self, user_id: str, username: str) -> dict[str, Any]:
        username = normalize_username(username)
        username_key = username.casefold()
        if not self.pool:
            account = next((item for item in self.fallback_accounts.values() if item.get("id") == user_id), None)
            if not account:
                raise AccountUnavailableError("Account storage is unavailable")
            account["username"] = username
            self._mirror_fallback_account(
                account["id"], account["username"], account["discriminator"], account["password_hash"], account["created_at"],
            )
            return self._account_user(account)

        try:
            row = await self.pool.fetchrow(
                """
                UPDATE cb_users
                SET username = $1, username_key = $2
                WHERE id = $3
                RETURNING id, username, discriminator, created_at, password_hash
                """,
                username,
                username_key,
                user_id,
            )
        except asyncpg.UniqueViolationError as error:
            raise ValueError("Could not update this callsign; please retry") from error
        except Exception as error:
            logger.warning("Neon callsign update failed", exc_info=True)
            raise AccountUnavailableError("Account service temporarily unavailable") from error
        if not row:
            raise ValueError("Account was not found")
        self._mirror_fallback_account(row["id"], row["username"], row["discriminator"], row["password_hash"], row["created_at"])
        return self._user(row)

    def _fallback_create_session(self, user_id: str) -> str:
        token = secrets.token_urlsafe(48)
        self.fallback_sessions[self._token_hash(token)] = {
            "user_id": user_id,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        }
        self._save_fallback()
        return token

    def _fallback_login(self, username: str, password: str) -> tuple[dict[str, Any], str]:
        base_username, discriminator = split_identity(username)
        matches = [
            account for account in self.fallback_accounts.values()
            if account["username"].casefold() == base_username.casefold()
            and (discriminator is None or account["discriminator"] == discriminator)
        ]
        if discriminator is None and len(matches) > 1:
            raise InvalidCredentialsError("Multiple callsigns found; sign in with CALLSIGN#1234")
        account = matches[0] if matches else None
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
            "discriminator": row["discriminator"],
            "created_at": row["created_at"].isoformat(),
        }

    async def register(self, username: str, password: str) -> tuple[dict[str, Any], str]:
        if not self.session_secret:
            raise AccountUnavailableError("Account service is not configured")
        if not self.pool:
            return self._fallback_register(username, password)
        pool = self.pool
        username = normalize_username(username)
        username_key = username.casefold()
        user_id = secrets.token_hex(16)
        password_hash = hash_password(password)
        for _attempt in range(5):
            discriminator = generate_discriminator()
            try:
                row = await pool.fetchrow(
                    """
                    INSERT INTO cb_users (id, username, username_key, discriminator, password_hash)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING id, username, discriminator, created_at
                    """,
                    user_id,
                    username,
                    username_key,
                    discriminator,
                    password_hash,
                )
            except asyncpg.UniqueViolationError as exc:
                if _attempt == 4:
                    raise UsernameTakenError("Could not reserve a unique callsign handle; please retry") from exc
            except Exception:
                logger.warning("Neon registration failed; using emergency account fallback", exc_info=True)
                self.pool = None
                return self._fallback_register(username, password)
            else:
                self._mirror_fallback_account(row["id"], row["username"], row["discriminator"], password_hash, row["created_at"])
                return self._user(row), await self._create_session(user_id)
        raise UsernameTakenError("Could not reserve a unique callsign handle; please retry")

    async def login(self, username: str, password: str) -> tuple[dict[str, Any], str]:
        if not self.session_secret:
            raise AccountUnavailableError("Account service is not configured")
        if not self.pool:
            return self._fallback_login(username, password)
        pool = self.pool
        base_username, discriminator = split_identity(username)
        try:
            if discriminator:
                row = await pool.fetchrow(
                    "SELECT id, username, discriminator, password_hash, created_at FROM cb_users WHERE username_key = $1 AND discriminator = $2",
                    base_username.casefold(), discriminator,
                )
            else:
                rows = await pool.fetch(
                    "SELECT id, username, discriminator, password_hash, created_at FROM cb_users WHERE username_key = $1",
                    base_username.casefold(),
                )
                if len(rows) > 1:
                    raise InvalidCredentialsError("Multiple callsigns found; sign in with CALLSIGN#1234")
                row = rows[0] if rows else None
        except Exception as error:
            if isinstance(error, InvalidCredentialsError):
                raise
            logger.warning("Neon login failed; using emergency account fallback", exc_info=True)
            self.pool = None
            return self._fallback_login(username, password)
        if not row or not verify_password(password, row["password_hash"]):
            raise InvalidCredentialsError("Invalid callsign or password")
        self._mirror_fallback_account(row["id"], row["username"], row["discriminator"], row["password_hash"], row["created_at"])
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
                SELECT u.id, u.username, u.discriminator, u.created_at
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
            "discriminator": row["other_discriminator"],
            "status": row["status"],
            "direction": direction,
            "created_at": row["created_at"].isoformat(),
        }

    async def find_user(self, identity: str, current_user_id: str) -> dict[str, Any] | None:
        pool = self._require_storage()
        username, discriminator = split_identity(identity, require_discriminator=True)
        row = await pool.fetchrow(
            "SELECT id, username, discriminator, created_at FROM cb_users WHERE username_key = $1 AND discriminator = $2 AND id <> $3",
            username.casefold(), discriminator, current_user_id,
        )
        return self._user(row) if row else None

    async def list_friends(self, user_id: str) -> list[dict[str, Any]]:
        pool = self._require_storage()
        rows = await pool.fetch(
            """
            SELECT f.*, u.username AS other_username, u.discriminator AS other_discriminator
            FROM cb_friendships f
            JOIN cb_users u ON u.id = CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END
            WHERE f.user_a = $1 OR f.user_b = $1
            ORDER BY f.updated_at DESC
            """, user_id,
        )
        return [self._friend(row, user_id) for row in rows]

    async def send_friend_request(self, requester_id: str, identity: str) -> dict[str, Any]:
        pool = self._require_storage()
        target = await self.find_user(identity, requester_id)
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
            target_id, "friend_request", "New friend request", f"{target['username']}#{target['discriminator']} sent you a friend request.",
            {"user_id": requester_id},
        )
        return {
            "user_id": target_id,
            "username": target["username"],
            "discriminator": target["discriminator"],
            "status": "pending",
            "direction": "outgoing",
        }

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
            sender = await pool.fetchrow("SELECT username, discriminator FROM cb_users WHERE id = $1", other_user_id)
            await self.create_notification(
                other_user_id, "friend_accepted", "Friend request accepted", f"{sender['username']}#{sender['discriminator']} accepted your request.", {},
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
