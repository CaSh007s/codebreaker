"""Neon-backed accounts and cookie-session storage."""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Any

import asyncpg
from dotenv import load_dotenv

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

    @property
    def configured(self) -> bool:
        return bool(self.pool and self.session_secret)

    async def initialize(self) -> None:
        database_url = os.getenv("DATABASE_URL", "").strip()
        self.session_secret = os.getenv("SESSION_SECRET", "").strip()
        if not database_url or not self.session_secret:
            logger.info("Account storage is not configured; guest mode remains available")
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

    def _require_storage(self) -> asyncpg.Pool:
        if not self.configured:
            raise AccountUnavailableError("Account service is not configured")
        return self.pool  # type: ignore[return-value]

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
        pool = self._require_storage()
        username_key = username.casefold()
        user_id = secrets.token_hex(16)
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
                hash_password(password),
            )
        except asyncpg.UniqueViolationError as exc:
            raise UsernameTakenError("That callsign is already registered") from exc
        return self._user(row), await self._create_session(user_id)

    async def login(self, username: str, password: str) -> tuple[dict[str, Any], str]:
        pool = self._require_storage()
        row = await pool.fetchrow(
            "SELECT id, username, password_hash, created_at FROM cb_users WHERE username_key = $1",
            username.casefold(),
        )
        if not row or not verify_password(password, row["password_hash"]):
            raise InvalidCredentialsError("Invalid callsign or password")
        return self._user(row), await self._create_session(row["id"])

    async def _create_session(self, user_id: str) -> str:
        pool = self._require_storage()
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
        pool = self._require_storage()
        row = await pool.fetchrow(
            """
            SELECT u.id, u.username, u.created_at
            FROM cb_sessions s JOIN cb_users u ON u.id = s.user_id
            WHERE s.token_hash = $1 AND s.expires_at > NOW()
            """,
            self._token_hash(token),
        )
        return self._user(row) if row else None

    async def delete_session(self, token: str | None) -> None:
        if token and self.configured:
            await self.pool.execute("DELETE FROM cb_sessions WHERE token_hash = $1", self._token_hash(token))  # type: ignore[union-attr]


account_service = AccountService()
