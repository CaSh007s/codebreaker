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

class GameState(BaseModel):
    id: str
    secret_code: str
    mode: GameMode
    status: GameStatus
    attempts: int
    max_attempts: Optional[int]
    created_at: datetime
    last_guess_at: Optional[datetime] = None
