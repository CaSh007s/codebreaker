from pydantic import BaseModel, Field
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
    code_length: int = Field(default=4, ge=3, le=6)
    max_attempts: Optional[int] = Field(default=None, ge=1, le=1000)
    allow_repeats: bool = True
    time_limit: Optional[int] = Field(default=None, ge=1, le=3600)

class NewGameResponse(BaseModel):
    game_id: str
    code_length: int
    mode: GameMode
    max_attempts: Optional[int]

class GuessRequest(BaseModel):
    guess: str = Field(pattern=r"^[0-9]{3,6}$")

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
    feedback_map: List[int]
    created_at: datetime
    last_guess_at: Optional[datetime] = None
    time_limit: Optional[int] = None
    revealed_indices: List[int] = Field(default_factory=list)

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
    username: str = Field(min_length=1, max_length=64)
    level: str = Field(min_length=1, max_length=32)
    tries: int = Field(ge=0, le=99999)
    time_seconds: int = Field(ge=0)
    status: GameStatus = GameStatus.SOLVED
    score: int = Field(default=0, ge=0, le=1000000)
    timer_mode: bool = False
    infinite_mode: bool = False
