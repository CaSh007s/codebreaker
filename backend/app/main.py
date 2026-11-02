from fastapi import FastAPI, HTTPException, Request, Response
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
import logging

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.socket_manager import app_sio, configure_socket_manager
from app.models.account import (
    AccountCredentials,
    AccountCallsignUpdate,
    ChallengeRequest,
    ChallengeResponse,
    DirectMessageRecord,
    DirectMessageRequest,
    AccountResponse,
    AuthResponse,
    FriendAction,
    FriendRecord,
    FriendTarget,
    ProfileResponse,
    ReportRequest,
    NotificationRecord,
    PushSubscription,
)
from app.services.account_service import (
    AccountUnavailableError,
    InvalidCredentialsError,
    UsernameTakenError,
    account_service,
)

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await multiplayer_service.initialize()
    configure_socket_manager(multiplayer_service.storage_backend == "redis")
    await account_service.initialize()
    yield
    await account_service.close()
    await multiplayer_service.redis_client.aclose()


app = FastAPI(title="Codebreaker API", lifespan=lifespan)


@app.exception_handler(RedisError)
async def storage_unavailable(request: Request, exc: RedisError):
    return JSONResponse(status_code=503, content={"detail": "Game service temporarily unavailable. Please retry."})


@app.exception_handler(AccountUnavailableError)
async def account_storage_unavailable(request: Request, exc: AccountUnavailableError):
    return JSONResponse(status_code=503, content={"detail": str(exc)})

# Enable CORS
raw_origins = os.getenv(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://0.0.0.0:3000,http://localhost:13000,http://127.0.0.1:13000",
)
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

SESSION_COOKIE = "codebreaker_session"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "").lower()

MAX_SCORE_BY_LEVEL = {
    "ROOKIE": 500,
    "EASY": 1000,
    "MEDIUM": 2000,
    "HARD": 3500,
    "ELITE": 5000,
    "MASTER": 10000,
}


def is_suspicious_score(entry: LeaderboardRequest) -> bool:
    """Flag scores that exceed the client game's published scoring ceiling."""
    if entry.status != GameStatus.SOLVED:
        return entry.score != 0
    base = MAX_SCORE_BY_LEVEL.get(entry.level.upper(), 1000)
    ceiling = base * (1.5 if entry.timer_mode else 1.0) * (0.7 if entry.infinite_mode else 1.0)
    return entry.score > round(ceiling * 1.1)


def set_session_cookie(request: Request, response: Response, token: str) -> None:
    # Hosted frontends and APIs commonly use different HTTPS domains. A
    # cross-site cookie is required for the browser to keep that session.
    request_is_https = request.url.scheme == "https" or request.headers.get("origin", "").startswith("https://")
    secure = COOKIE_SECURE or request_is_https
    same_site = COOKIE_SAMESITE or ("none" if secure else "lax")
    if same_site not in {"lax", "strict", "none"}:
        same_site = "none" if secure else "lax"
    if same_site == "none":
        secure = True
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=60 * 60 * 24 * 30,
        httponly=True,
        secure=secure,
        samesite=same_site,
        path="/",
    )


def account_response(user: dict) -> AuthResponse:
    return AuthResponse(user=AccountResponse(**user))


def account_http_error(error: Exception) -> HTTPException:
    if isinstance(error, AccountUnavailableError):
        return HTTPException(status_code=503, detail="Account service is not configured")
    if isinstance(error, UsernameTakenError):
        return HTTPException(status_code=409, detail=str(error))
    if isinstance(error, InvalidCredentialsError):
        return HTTPException(status_code=401, detail=str(error))
    if isinstance(error, ValueError):
        return HTTPException(status_code=400, detail=str(error))
    return HTTPException(status_code=503, detail="Account service temporarily unavailable")


async def authenticated_user(request: Request) -> dict:
    try:
        user = await account_service.get_user(request.cookies.get(SESSION_COOKIE))
    except AccountUnavailableError as error:
        raise account_http_error(error) from error
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to use social features")
    return user

# Mount Socket.IO app
app.mount("/socket.io", app_sio)

@app.get("/")
async def root():
    return {
        "message": "Codebreaker API - Tactical Uplink Active",
        "status": "online",
        "docs": "/docs",
        "health": "/health",
        "readiness": "/ready"
    }


@app.post("/auth/register", response_model=AuthResponse)
@limiter.limit("5/minute")
async def register_account(request: Request, credentials: AccountCredentials, response: Response):
    try:
        user, token = await account_service.register(credentials.username, credentials.password)
    except (AccountUnavailableError, UsernameTakenError, ValueError) as error:
        raise account_http_error(error) from error
    set_session_cookie(request, response, token)
    return account_response(user)


@app.post("/auth/login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def login_account(request: Request, credentials: AccountCredentials, response: Response):
    try:
        user, token = await account_service.login(credentials.username, credentials.password)
    except (AccountUnavailableError, InvalidCredentialsError, ValueError) as error:
        raise account_http_error(error) from error
    set_session_cookie(request, response, token)
    return account_response(user)


@app.get("/auth/me", response_model=AuthResponse)
async def current_account(request: Request):
    user = await authenticated_user(request)
    return account_response(user)


@app.patch("/auth/profile", response_model=AuthResponse)
async def update_profile(request: Request, update: AccountCallsignUpdate):
    user = await authenticated_user(request)
    try:
        updated = await account_service.update_profile(user["user_id"], update.username, update.avatar_url)
    except (AccountUnavailableError, ValueError) as error:
        raise account_http_error(error) from error
    return account_response(updated)


@app.post("/auth/logout", status_code=204)
async def logout_account(request: Request, response: Response):
    try:
        await account_service.delete_session(request.cookies.get(SESSION_COOKIE))
    except AccountUnavailableError:
        pass
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.status_code = 204
    return response


@app.get("/social/friends", response_model=List[FriendRecord])
async def list_friends(request: Request):
    user = await authenticated_user(request)
    try:
        return await account_service.list_friends(user["user_id"])
    except AccountUnavailableError as error:
        raise account_http_error(error) from error


@app.get("/social/profiles/{identity}", response_model=ProfileResponse)
async def get_profile(request: Request, identity: str):
    user = await authenticated_user(request)
    try:
        profile = await account_service.get_profile(identity, user["user_id"])
        scores = await load_scores()
        matching_scores = [score for score in scores if not score.suspicious and score.username.casefold() == profile["username"].casefold()]
        profile["records"] = {
            "games_played": len(matching_scores),
            "wins": sum(1 for score in matching_scores if score.status == GameStatus.SOLVED),
            "losses": sum(1 for score in matching_scores if score.status != GameStatus.SOLVED),
            "best_score": max((score.score for score in matching_scores), default=0),
        }
        return profile
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/social/friends/requests", response_model=FriendRecord)
@limiter.limit("20/minute")
async def send_friend_request(request: Request, target: FriendTarget):
    user = await authenticated_user(request)
    try:
        return await account_service.send_friend_request(user["user_id"], target.identity)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/social/friends/requests/{other_user_id}/accept", status_code=204)
async def accept_friend_request(request: Request, other_user_id: str):
    user = await authenticated_user(request)
    try:
        await account_service.respond_friend_request(user["user_id"], other_user_id, True)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return Response(status_code=204)


@app.post("/social/friends/requests/{other_user_id}/decline", status_code=204)
async def decline_friend_request(request: Request, other_user_id: str):
    user = await authenticated_user(request)
    try:
        await account_service.respond_friend_request(user["user_id"], other_user_id, False)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return Response(status_code=204)


@app.delete("/social/friends/{other_user_id}", status_code=204)
async def remove_friend(request: Request, other_user_id: str):
    user = await authenticated_user(request)
    await account_service.remove_friend(user["user_id"], other_user_id)
    return Response(status_code=204)


@app.post("/social/friends/{other_user_id}/challenge", response_model=ChallengeResponse)
async def challenge_friend(request: Request, other_user_id: str, challenge: ChallengeRequest):
    user = await authenticated_user(request)
    try:
        await account_service.challenge_friend(user["user_id"], other_user_id, challenge.room_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return ChallengeResponse(room_id=challenge.room_id)


@app.get("/social/messages/{other_user_id}", response_model=List[DirectMessageRecord])
async def list_direct_messages(request: Request, other_user_id: str):
    user = await authenticated_user(request)
    try:
        return await account_service.list_direct_messages(user["user_id"], other_user_id)
    except ValueError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error


@app.post("/social/messages/{other_user_id}", response_model=DirectMessageRecord)
@limiter.limit("30/minute")
async def send_direct_message(request: Request, other_user_id: str, message: DirectMessageRequest):
    user = await authenticated_user(request)
    try:
        return await account_service.send_direct_message(user["user_id"], other_user_id, message.body)
    except ValueError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error


@app.post("/social/reports", status_code=204)
@limiter.limit("10/hour")
async def report_user(request: Request, report: ReportRequest):
    user = await authenticated_user(request)
    try:
        await account_service.report_user(user["user_id"], report.target_user_id, report.reason)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return Response(status_code=204)


@app.post("/social/blocks/{other_user_id}", status_code=204)
async def block_user(request: Request, other_user_id: str):
    user = await authenticated_user(request)
    try:
        await account_service.block_user(user["user_id"], other_user_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return Response(status_code=204)


@app.get("/social/blocks", response_model=List[FriendRecord])
async def list_blocked_users(request: Request):
    user = await authenticated_user(request)
    try:
        return await account_service.list_blocked_users(user["user_id"])
    except AccountUnavailableError as error:
        raise account_http_error(error) from error


@app.delete("/social/blocks/{other_user_id}", status_code=204)
async def unblock_user(request: Request, other_user_id: str):
    user = await authenticated_user(request)
    try:
        await account_service.unblock_user(user["user_id"], other_user_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return Response(status_code=204)


@app.get("/social/notifications", response_model=List[NotificationRecord])
async def list_notifications(request: Request):
    user = await authenticated_user(request)
    return await account_service.list_notifications(user["user_id"])


@app.post("/social/notifications/{notification_id}/read", status_code=204)
async def mark_notification_read(request: Request, notification_id: str):
    user = await authenticated_user(request)
    await account_service.mark_notification_read(user["user_id"], notification_id)
    return Response(status_code=204)


@app.post("/social/push-subscriptions", status_code=204)
async def save_push_subscription(request: Request, subscription: PushSubscription):
    user = await authenticated_user(request)
    await account_service.save_push_subscription(user["user_id"], subscription.endpoint, subscription.p256dh, subscription.auth)
    return Response(status_code=204)

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
        [entry for entry in await load_scores() if not entry.suspicious],
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
        suspicious=is_suspicious_score(lb_req),
        timestamp=datetime.now(timezone.utc)
    )
    if entry.suspicious:
        logger.warning("Suspicious leaderboard score flagged for %s at level %s", entry.username, entry.level)
    await save_score(entry)
    return entry

@app.get("/wakeup")
async def wakeup_check():
    return {"status": "ok"}


@app.get("/health")
async def health_check():
    """Render health probe; deliberately does not depend on Redis."""
    return {"status": "ok"}


@app.get("/ready")
async def readiness_check():
    """Report whether durable Redis-backed features are available."""
    if multiplayer_service.storage_backend != "redis":
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "storage": "memory", "detail": "Redis is unavailable"},
        )
    return {"status": "ready", "storage": "redis"}


@app.get("/v1/models")
async def models_probe():
    """Compatibility response for generic service monitors."""
    return {"object": "list", "data": []}
