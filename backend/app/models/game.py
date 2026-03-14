from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from enum import Enum

class GameStatus(Enum):
    ACTIVE = "active"
    SOLVED = "solved"
    FAILED = "failed"
    SURRENDERED = "surrendered"

class GameMode(Enum):
    CLASSIC = "classic"
    TIMER = "timer"
    LIMITED = "limited"

class NewGameRequest(BaseModel):
    mode: GameMode = GameMode.CLASSIC
    code_length: int = 4
    max_attempts: Optional[int] = None
    allow_repeats: bool = True

class NewGameResponse(BaseModel):
    game_id: str
    code_length: int
    mode: GameMode
    max_attempts: Optional[int]

class GuessRequest(BaseModel):
    guess: str

class GuessResponse(BaseModel):
    bulls: int
    cows: int
    gray: int
    shuffled_feedback: List[str]
    solved: bool
    attempts_remaining: Optional[int]
    status: GameStatus
    secret_code: Optional[str] = None

class GameState(BaseModel):
    id: str
    secret_code: str
    mode: GameMode
    status: GameStatus
    attempts: int
    max_attempts: Optional[int]
    created_at: datetime
    last_guess_at: Optional[datetime] = None

class HintRequest(BaseModel):
    revealed_indices: List[int]
    target_index: Optional[int] = None

class HintResponse(BaseModel):
    position: int
    digit: str

class LeaderboardEntry(BaseModel):
    username: str
    level: str
    tries: int
    time_seconds: int
    timestamp: datetime
    status: GameStatus = GameStatus.SOLVED
    score: int = 0
    timer_mode: bool = False
    infinite_mode: bool = False

class LeaderboardRequest(BaseModel):
    username: str
    level: str
    tries: int
    time_seconds: int
    status: GameStatus = GameStatus.SOLVED
    score: int = 0
    timer_mode: bool = False
    infinite_mode: bool = False
