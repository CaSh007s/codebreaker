from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.models.game import (
    GameMode, GameStatus, GameState, 
    NewGameRequest, NewGameResponse, 
    GuessRequest, GuessResponse
)
from app.services.game_service import GameService
from typing import Dict
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

@app.post("/game/new", response_model=NewGameResponse)
async def create_game(request: NewGameRequest):
    game_id = str(uuid.uuid4())
    secret_code = GameService.generate_secret_code(request.code_length, request.allow_repeats)
    
    game = GameState(
        id=game_id,
        secret_code=secret_code,
        mode=request.mode,
        status=GameStatus.ACTIVE,
        attempts=0,
        max_attempts=request.max_attempts, # Defaults to None if not provided
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
    shuffled_feedback = [f.value for f in GameService.shuffle_feedback(bulls, cows, gray)]
    
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
        status=game.status
    )

@app.post("/game/{game_id}/surrender")
async def surrender_game(game_id: str):
    if game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    
    game = games[game_id]
    game.status = GameStatus.SURRENDERED
    
    return {"secret_code": game.secret_code}

@app.get("/health")
async def health_check():
    return {"status": "ok"}
