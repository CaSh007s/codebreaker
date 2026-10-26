"""Small async Redis-compatible fallback for local/degraded single-process use."""
from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from typing import Any


class _MemoryLock:
    def __init__(self, lock: asyncio.Lock, blocking_timeout: float | None = None):
        self._lock = lock
        self._blocking_timeout = blocking_timeout

    async def __aenter__(self):
        acquire = self._lock.acquire()
        if self._blocking_timeout is None:
            await acquire
        else:
            await asyncio.wait_for(acquire, timeout=self._blocking_timeout)
        return self

    async def __aexit__(self, *_):
        self._lock.release()


class _MemoryPipeline:
    def __init__(self, store: "MemoryStore"):
        self._store = store
        self._operations: list[tuple[str, tuple[Any, ...]]] = []

    def zadd(self, *args):
        self._operations.append(("zadd", args))
        return self

    def zremrangebyrank(self, *args):
        self._operations.append(("zremrangebyrank", args))
        return self

    async def execute(self):
        results = []
        for operation, args in self._operations:
            results.append(await getattr(self._store, operation)(*args))
        return results

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None


class MemoryStore:
    """Process-local storage used only when Redis cannot be reached.

    It intentionally mirrors only the Redis operations used by Codebreaker.
    Redis remains required for persistence and multi-worker deployments.
    """

    def __init__(self):
        self._values: dict[str, Any] = {}
        self._expiry: dict[str, float] = {}
        self._locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    def _purge(self, key: str):
        if key in self._expiry and self._expiry[key] <= time.monotonic():
            self._values.pop(key, None)
            self._expiry.pop(key, None)

    async def ping(self):
        return True

    async def get(self, key: str):
        self._purge(key)
        return self._values.get(key)

    async def set(self, key: str, value: Any, ex: int | None = None, **_):
        self._values[key] = value
        if ex is None:
            self._expiry.pop(key, None)
        else:
            self._expiry[key] = time.monotonic() + ex
        return True

    async def expire(self, key: str, seconds: int):
        self._purge(key)
        if key not in self._values:
            return False
        self._expiry[key] = time.monotonic() + seconds
        return True

    async def ttl(self, key: str):
        self._purge(key)
        if key not in self._values:
            return -2
        if key not in self._expiry:
            return -1
        return max(0, int(self._expiry[key] - time.monotonic()))

    async def delete(self, *keys: str):
        removed = 0
        for key in keys:
            self._purge(key)
            if key in self._values:
                removed += 1
            self._values.pop(key, None)
            self._expiry.pop(key, None)
        return removed

    async def incr(self, key: str):
        self._purge(key)
        value = int(self._values.get(key, 0)) + 1
        self._values[key] = value
        return value

    def lock(self, key: str, **kwargs):
        return _MemoryLock(self._locks[key], kwargs.get("blocking_timeout"))

    def pipeline(self, **_):
        return _MemoryPipeline(self)

    async def zadd(self, key: str, mapping: dict[str, float]):
        current = self._values.setdefault(key, {})
        current.update(mapping)
        return len(mapping)

    async def zremrangebyrank(self, key: str, start: int, stop: int):
        current = self._values.setdefault(key, {})
        ordered = sorted(current, key=lambda member: current[member])
        end = stop + 1 if stop >= 0 else len(ordered) + stop + 1
        selected = ordered[start:end]
        for member in selected:
            current.pop(member, None)
        return len(selected)

    async def zrevrange(self, key: str, start: int, stop: int):
        current = self._values.get(key, {})
        ordered = sorted(current, key=lambda member: current[member], reverse=True)
        end = stop + 1 if stop >= 0 else len(ordered) + stop + 1
        return ordered[start:end]

    async def aclose(self):
        return None
