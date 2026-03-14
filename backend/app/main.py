from fastapi import FastAPI, HTTPException
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

app = FastAPI(title="Codebreaker API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for demo/initial phase
games: Dict[str, GameState] = {}
leaderboard: List[LeaderboardEntry] = []

@app.post("/game/new", response_model=NewGameResponse)
async def create_game(request: NewGameRequest):
    game_id = str(uuid.uuid4())
    secret_code = GameService.generate_secret_code(request.code_length, request.allow_repeats)
    feedback_map = GameService.generate_feedback_map(request.code_length)
    
    game = GameState(
        id=game_id,
        secret_code=secret_code,
        mode=request.mode,
        status=GameStatus.ACTIVE,
        attempts=0,
        max_attempts=request.max_attempts,
        feedback_map=feedback_map,
        created_at=datetime.utcnow()
    )
    
    games[game_id] = game
    
    return NewGameResponse(
        game_id=game_id,
        code_length=request.code_length,
        mode=request.mode,
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
async def add_to_leaderboard(request: LeaderboardRequest):
    entry = LeaderboardEntry(
        username=request.username,
        level=request.level,
        tries=request.tries,
        time_seconds=request.time_seconds,
        status=request.status,
        score=request.score,
        timer_mode=request.timer_mode,
        infinite_mode=request.infinite_mode,
        timestamp=datetime.utcnow()
    )
    leaderboard.append(entry)
    return entry

@app.get("/health")
async def health_check():
    return {"status": "ok"}
