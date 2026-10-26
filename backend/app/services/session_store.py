"""Shared single-player sessions and scores survive web-service restarts."""
from contextlib import asynccontextmanager

from fastapi import HTTPException

from app.models.game import GameState, LeaderboardEntry
from app.services.multiplayer_service import multiplayer_service

GAME_EXPIRY = 24 * 60 * 60
LEADERBOARD_KEY = "codebreaker:leaderboard"


async def save_game(game: GameState):
    await multiplayer_service.redis_client.setex(f"game:{game.id}", GAME_EXPIRY, game.model_dump_json())


@asynccontextmanager
async def game_session(game_id: str):
    redis = multiplayer_service.redis_client
    async with redis.lock(f"game_lock:{game_id}", timeout=15, blocking_timeout=10):
        raw = await redis.get(f"game:{game_id}")
        if not raw:
            raise HTTPException(status_code=404, detail="Game not found")
        game = GameState.model_validate_json(raw)
        yield game
        await save_game(game)


async def save_score(entry: LeaderboardEntry):
    # Keep a bounded ranked registry, rather than losing it on every deploy.
    priority = {"solved": 3, "surrendered": 2, "failed": 1, "active": 0}
    rank = priority[entry.status.value] * 10**12 + entry.score * 10**5 - min(entry.tries, 99999)
    async with multiplayer_service.redis_client.pipeline(transaction=True) as pipeline:
        pipeline.zadd(LEADERBOARD_KEY, {entry.model_dump_json(): rank})
        pipeline.zremrangebyrank(LEADERBOARD_KEY, 0, -501)
        await pipeline.execute()


async def load_scores():
    entries = await multiplayer_service.redis_client.zrevrange(LEADERBOARD_KEY, 0, -1)
    return [LeaderboardEntry.model_validate_json(entry) for entry in entries]
