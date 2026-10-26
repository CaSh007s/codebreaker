from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis.exceptions import RedisError
from app.models.game import (
    GameMode, GameStatus, GameState, 
    NewGameRequest, NewGameResponse, 
    GuessRequest, GuessResponse,
    LeaderboardEntry, LeaderboardRequest,
    HintRequest, HintResponse
)
from app.services.game_service import GameService
from app.services.session_store import game_session, save_game, save_score, load_scores
from app.services.multiplayer_service import multiplayer_service
from contextlib import asynccontextmanager
from typing import List
from datetime import datetime, timezone
import uuid
import os
import random

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.socket_manager import app_sio

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await multiplayer_service.redis_client.aclose()


app = FastAPI(title="Codebreaker API", lifespan=lifespan)


@app.exception_handler(RedisError)
async def storage_unavailable(request: Request, exc: RedisError):
    return JSONResponse(status_code=503, content={"detail": "Game service temporarily unavailable. Please retry."})

# Enable CORS
raw_origins = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://0.0.0.0:3000")
allowed_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",  # Safety net for Vercel deployments
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Rate Limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Mount Socket.IO app
app.mount("/socket.io", app_sio)

@app.get("/")
async def root():
    return {
        "message": "Codebreaker API - Tactical Uplink Active",
        "status": "online",
        "docs": "/docs",
        "health": "/wakeup"
    }

@app.post("/game/new", response_model=NewGameResponse)
@limiter.limit("5/minute")
async def create_game(request: Request, game_req: NewGameRequest):
    game_id = str(uuid.uuid4())
    secret_code = GameService.generate_secret_code(game_req.code_length, game_req.allow_repeats)
    feedback_map = GameService.generate_feedback_map(game_req.code_length)
    
    game = GameState(
        id=game_id,
        secret_code=secret_code,
        mode=game_req.mode,
        status=GameStatus.ACTIVE,
        attempts=0,
        max_attempts=game_req.max_attempts,
        feedback_map=feedback_map,
        created_at=datetime.now(timezone.utc),
        time_limit=game_req.time_limit
    )
    
    await save_game(game)
    
    return NewGameResponse(
        game_id=game_id,
        code_length=game_req.code_length,
        mode=game_req.mode,
        max_attempts=game.max_attempts
    )

@app.post("/game/{game_id}/guess", response_model=GuessResponse)
async def submit_guess(game_id: str, request: GuessRequest):
    async with game_session(game_id) as game:
        if game.status != GameStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="Game is no longer active")
        if game.time_limit and (datetime.now(timezone.utc) - game.created_at).total_seconds() >= game.time_limit:
            game.status = GameStatus.FAILED
            return GuessResponse(bulls=0, cows=0, gray=0, shuffled_feedback=[], solved=False,
                                 attempts_remaining=0, status=game.status, secret_code=game.secret_code)
        if len(request.guess) != len(game.secret_code):
            raise HTTPException(status_code=400, detail=f"Guess must be {len(game.secret_code)} digits long")
        game.attempts += 1
        game.last_guess_at = datetime.now(timezone.utc)
        bulls, cows, gray = GameService.evaluate_guess(game.secret_code, request.guess)
        shuffled_feedback = GameService.evaluate_positional(game.secret_code, request.guess, game.feedback_map)
        solved = bulls == len(game.secret_code)
        if solved:
            game.status = GameStatus.SOLVED
        elif game.max_attempts and game.attempts >= game.max_attempts:
            game.status = GameStatus.FAILED
        return GuessResponse(
            bulls=bulls, cows=cows, gray=gray, shuffled_feedback=shuffled_feedback,
            solved=solved,
            attempts_remaining=max(0, game.max_attempts - game.attempts) if game.max_attempts else None,
            status=game.status,
            secret_code=game.secret_code if game.status != GameStatus.ACTIVE else None,
        )

@app.post("/game/{game_id}/surrender")
async def surrender_game(game_id: str):
    async with game_session(game_id) as game:
        if game.status != GameStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="Game is no longer active")
        game.status = GameStatus.SURRENDERED
        return {"secret_code": game.secret_code}


@app.post("/game/{game_id}/expire")
async def expire_game(game_id: str):
    async with game_session(game_id) as game:
        if game.status == GameStatus.ACTIVE:
            if not game.time_limit or (datetime.now(timezone.utc) - game.created_at).total_seconds() < game.time_limit:
                raise HTTPException(status_code=400, detail="Timer has not expired")
            game.status = GameStatus.FAILED
        return {"secret_code": game.secret_code, "status": game.status.value}

@app.post("/game/{game_id}/hint", response_model=HintResponse)
async def get_hint(game_id: str, request: HintRequest):
    async with game_session(game_id) as game:
        if game.status != GameStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="Game is no longer active")
        code_len = len(game.secret_code)
        if game.time_limit and (datetime.now(timezone.utc) - game.created_at).total_seconds() >= game.time_limit:
            raise HTTPException(status_code=400, detail="Timer has expired")
        if len(game.revealed_indices) >= code_len - 2:
            raise HTTPException(status_code=400, detail="At least 2 digits must remain unrevealed")
        available_indices = list(set(range(code_len)) - set(game.revealed_indices))
        if request.target_index is not None:
            if request.target_index not in available_indices:
                raise HTTPException(status_code=400, detail="Invalid or already revealed index")
            target_idx = request.target_index
        else:
            target_idx = random.choice(available_indices)
        game.revealed_indices.append(target_idx)
        return HintResponse(position=target_idx, digit=game.secret_code[target_idx])

@app.get("/leaderboard", response_model=List[LeaderboardEntry])
async def get_leaderboard():
    # Priority: SOLVED > SURRENDERED > FAILED
    status_priority = {
        GameStatus.SOLVED: 0,
        GameStatus.SURRENDERED: 1,
        GameStatus.FAILED: 2,
        GameStatus.ACTIVE: 3
    }
    sorted_leaderboard = sorted(
        await load_scores(),
        key=lambda x: (
            status_priority.get(x.status, 99), 
            -x.score,  # Higher score is better
            x.tries, 
            x.time_seconds
        )
    )
    return sorted_leaderboard[:20]

@app.post("/leaderboard", response_model=LeaderboardEntry)
@limiter.limit("2/minute")
async def add_to_leaderboard(request: Request, lb_req: LeaderboardRequest):
    entry = LeaderboardEntry(
        username=lb_req.username,
        level=lb_req.level,
        tries=lb_req.tries,
        time_seconds=lb_req.time_seconds,
        status=lb_req.status,
        score=lb_req.score,
        timer_mode=lb_req.timer_mode,
        infinite_mode=lb_req.infinite_mode,
        timestamp=datetime.now(timezone.utc)
    )
    await save_score(entry)
    return entry

@app.get("/wakeup")
async def wakeup_check():
    return {"status": "ok"}
