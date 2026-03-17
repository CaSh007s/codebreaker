from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from app.models.game import (
    GameMode, GameStatus, GameState, 
    NewGameRequest, NewGameResponse, 
    GuessRequest, GuessResponse,
    LeaderboardEntry, LeaderboardRequest,
    HintRequest, HintResponse
)
from app.services.game_service import GameService
from typing import Dict, List
from datetime import datetime
import uuid
import os

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.socket_manager import app_sio

app = FastAPI(title="Codebreaker API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://0.0.0.0:3000",
    ],
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

# In-memory store for demo/initial phase
games: Dict[str, GameState] = {}
leaderboard: List[LeaderboardEntry] = []

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
        created_at=datetime.utcnow()
    )
    
    games[game_id] = game
    
    return NewGameResponse(
        game_id=game_id,
        code_length=game_req.code_length,
        mode=game_req.mode,
        max_attempts=game.max_attempts
    )

@app.post("/game/{game_id}/guess", response_model=GuessResponse)
async def submit_guess(game_id: str, request: GuessRequest):
    if game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    
    game = games[game_id]
    
    if game.status != GameStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Game is no longer active")
    
    if len(request.guess) != len(game.secret_code):
        raise HTTPException(status_code=400, detail=f"Guess must be {len(game.secret_code)} digits long")

    game.attempts += 1
    game.last_guess_at = datetime.utcnow()
    
    bulls, cows, gray = GameService.evaluate_guess(game.secret_code, request.guess)
    # Static Scramble Protocol: use fixed feedback_map for positional feedback
    shuffled_feedback = GameService.evaluate_positional(game.secret_code, request.guess, game.feedback_map)
    
    solved = bulls == len(game.secret_code)
    if solved:
        game.status = GameStatus.SOLVED
    elif game.max_attempts and game.attempts >= game.max_attempts:
        game.status = GameStatus.FAILED

    attempts_remaining = None
    if game.max_attempts:
        attempts_remaining = max(0, game.max_attempts - game.attempts)

    return GuessResponse(
        bulls=bulls,
        cows=cows,
        gray=gray,
        shuffled_feedback=shuffled_feedback,
        solved=solved,
        attempts_remaining=attempts_remaining,
        status=game.status,
        secret_code=game.secret_code if game.status != GameStatus.ACTIVE else None
    )

@app.post("/game/{game_id}/surrender")
async def surrender_game(game_id: str):
    if game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    
    game = games[game_id]
    game.status = GameStatus.SURRENDERED
    
    return {"secret_code": game.secret_code}

@app.post("/game/{game_id}/hint", response_model=HintResponse)
async def get_hint(game_id: str, request: HintRequest):
    if game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    
    game = games[game_id]
    if game.status != GameStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Game is no longer active")
    
    code_len = len(game.secret_code)
    all_indices = set(range(code_len))
    available_indices = list(all_indices - set(request.revealed_indices))
    
    if not available_indices:
        raise HTTPException(status_code=400, detail="No more hints available")
    
    if request.target_index is not None:
        if request.target_index >= code_len or request.target_index < 0:
            raise HTTPException(status_code=400, detail="Invalid target index")
        if request.target_index in request.revealed_indices:
            raise HTTPException(status_code=400, detail="Index already revealed")
        target_idx = request.target_index
    else:
        import random
        target_idx = random.choice(available_indices)
    
    return HintResponse(
        position=target_idx,
        digit=game.secret_code[target_idx]
    )

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
        leaderboard, 
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
        timestamp=datetime.utcnow()
    )
    leaderboard.append(entry)
    return entry

@app.get("/health")
async def health_check():
    return {"status": "ok"}
