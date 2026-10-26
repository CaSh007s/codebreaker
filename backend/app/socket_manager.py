import socketio
import os
from copy import deepcopy
from functools import wraps
from redis.exceptions import RedisError
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

from app.services.multiplayer_service import multiplayer_service

# Create a Socket.IO AsyncServer
mgr = socketio.AsyncRedisManager(REDIS_URL)
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    client_manager=mgr
)

# Combine Socket.IO server with the FastAPI app
app_sio = socketio.ASGIApp(sio)

# Track which room a SID is in for easier cleanup
sid_to_room = {}

# Chat constants
MAX_MESSAGE_LENGTH = 200
VALID_EMOJIS = ["🎯", "💀", "🔥", "👀", "🤯"]

# Rate limiting settings (events per 10 seconds)
CHAT_LIMIT = 10
GUESS_LIMIT = 30
RATE_LIMIT_WINDOW = 10


def game_event(handler):
    """Validate socket envelopes and report datastore failures to the client."""
    @wraps(handler)
    async def wrapped(sid, data):
        if not isinstance(data, dict) or not isinstance(data.get("room_id"), str) or not 1 <= len(data["room_id"]) <= 128:
            await sio.emit("error", {"message": "Invalid room request"}, to=sid)
            return
        info = data.get("player_info")
        if info is not None and (not isinstance(info, dict) or
                not isinstance(info.get("player_id"), str) or not 1 <= len(info["player_id"]) <= 128 or
                not isinstance(info.get("token"), str) or not 16 <= len(info["token"]) <= 128):
            await sio.emit("error", {"message": "Invalid player session"}, to=sid)
            return
        if "config" in data and not isinstance(data["config"], dict):
            await sio.emit("error", {"message": "Invalid room configuration"}, to=sid)
            return
        try:
            return await handler(sid, data)
        except RedisError:
            await sio.emit("error", {"message": "Game service temporarily unavailable. Please retry."}, to=sid)
    return sio.event(wrapped)


# --- Helper: Simple HTML Sanitization ---
def _sanitize_text(text: str) -> str:
    """Very basic tag stripping to prevent XSS in chat messages."""
    import re
    # Remove anything that looks like an HTML tag
    clean = re.compile('<.*?>')
    return re.sub(clean, '', text).strip()


# --- Helper: Redis Rate Limiter ---
async def _is_rate_limited(sid: str, action: str, limit: int) -> bool:
    """Check if an action is rate limited for a specific SID using Redis."""
    key = f"rate_limit:{action}:{sid}"
    try:
        current = await mgr.redis.incr(key)
        if current == 1:
            await mgr.redis.expire(key, RATE_LIMIT_WINDOW)
        
        return current > limit
    except Exception as e:
        print(f"Rate limit error: {e}")
        return False # Fallback to allow if Redis has issues


# --- Helper: Emit system message to a room ---
async def emit_system_message(room_id: str, text: str):
    """Broadcast a system-generated message to the room."""
    payload = {
        "sender_id": "__SYSTEM__",
        "sender_username": "SYSTEM",
        "text": text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": "system"
    }
    await sio.emit('chat_message', payload, room=room_id)


# --- Helper: Look up player username from room data ---
def _get_player_username(room, sid):
    if not room:
        return "UNKNOWN"
    for pid, p in room.get("players", {}).items():
        if p.get("sid") == sid:
            return p.get("username", "UNKNOWN")
    return "UNKNOWN"


async def publish_room(event, room, *, to=None):
    """Never send the answer, mapping, session IDs or private hints during play."""
    public = deepcopy(room)
    public.pop("feedback_map", None)
    if room.get("status") != "finished":
        public.pop("target", None)
    for player in public.get("players", {}).values():
        player.pop("sid", None)
        player.pop("token", None)
        player.setdefault("connection_status", "connected" if player.get("connected", False) else "disconnected")
        player["progress"].pop("hints", None)
    await sio.emit(event, public, to=to, room=None if to else room["room_id"])


async def send_hint_history(room, sid):
    player = next((p for p in room["players"].values() if p["sid"] == sid), None)
    if player:
        await sio.emit("hint_history", player["progress"].get("hints", []), to=sid)


async def chat_player(sid, room_id):
    if sid_to_room.get(sid) != room_id:
        return None
    room = await multiplayer_service.get_room(room_id)
    return next((p for p in (room or {}).get("players", {}).values() if p["sid"] == sid), None)


@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    room_id = sid_to_room.get(sid)
    if room_id:
        room = await multiplayer_service.leave_room(room_id, sid)
        if room:
            username = _get_player_username(room, sid)
            await emit_system_message(room_id, f"{username} lost connection")
            await publish_room('room_update', room)
            
        sid_to_room.pop(sid, None)
    print(f"Client disconnected: {sid}")

@game_event
async def init_room(sid, data):
    room_id = data.get('room_id')
    config = data.get('config')
    if room_id and config:
        # Check if room already exists — don't overwrite!
        existing = await multiplayer_service.get_room(room_id)
        if existing:
            # Identity-based "Room Full" check
            player_info = data.get('player_info', {})
            player_id = player_info.get('player_id')
            
            is_returning = player_id and player_id in existing.get("players", {})
            if len(existing["players"]) >= 2 and not is_returning:
                await sio.emit('error', {'message': 'Room is full'}, to=sid)
                return
            
            # Host Refresh Recovery: If info is present, update SID
            if is_returning:
                room = await multiplayer_service.join_room(room_id, sid, player_info)
                if room and "error" in room:
                    await sio.emit('error', {'message': room['error']}, to=sid)
                    return
                if room:
                    existing = room # Use the updated state

            await sio.enter_room(sid, room_id)
            sid_to_room[sid] = room_id
            if is_returning:
                username = player_info.get("username", "UNKNOWN")
                await emit_system_message(room_id, f"{username} re-established uplink")
            await publish_room('room_update', existing)
            await send_hint_history(existing, sid)
        else:
            # Create a brand new room
            room = await multiplayer_service.create_room(room_id, config)
            if "error" in room:
                await sio.emit('error', {'message': room['error']}, to=sid)
                return
            await sio.enter_room(sid, room_id)
            sid_to_room[sid] = room_id
            await publish_room('room_update', room)

@game_event
async def join_room(sid, data):
    room_id = data.get('room_id')
    if room_id:
        room = await multiplayer_service.get_room(room_id)
        if not room:
            await sio.emit('error', {'message': 'Room not found'}, to=sid)
            return

        # Identity-based "Room Full" check
        player_info = data.get('player_info', {})
        player_id = player_info.get('player_id')
        is_returning = player_id and player_id in room.get("players", {})

        if len(room["players"]) >= 2 and not is_returning:
            await sio.emit('error', {'message': 'Room is full'}, to=sid)
            return
 
        # If client sent player_info, try to re-join/update SID
        if player_info and player_id:
            updated_room = await multiplayer_service.join_room(room_id, sid, player_info)
            if updated_room and "error" not in updated_room:
                await sio.enter_room(sid, room_id)
                sid_to_room[sid] = room_id
                await publish_room('room_update', updated_room)
                await send_hint_history(updated_room, sid)
                
                # System message: reconnected
                if is_returning:
                    username = player_info.get("username", "UNKNOWN")
                    await emit_system_message(room_id, f"{username} re-established uplink")
                return
            elif updated_room:
                await sio.emit('error', {'message': updated_room['error']}, to=sid)
                return
 
        # Otherwise just send the current room state
        await sio.enter_room(sid, room_id)
        sid_to_room[sid] = room_id
        await publish_room('room_update', room, to=sid)

@game_event
async def setup_player(sid, data):
    room_id = data.get('room_id')
    player_info = data.get('player_info')
    if room_id and player_info:
        if sid_to_room.get(sid) != room_id:
            await sio.emit('error', {'message': 'Join the room before setup'}, to=sid)
            return
        room = await multiplayer_service.register_player(room_id, sid, player_info)
        if room and "error" in room:
            await sio.emit('error', {'message': room['error']}, to=sid)
        elif room:
            await publish_room('room_update', room)
            # System message: player joined
            username = player_info.get("username", "UNKNOWN")
            await emit_system_message(room_id, f"{username} joined the uplink")
        else:
            await sio.emit('error', {'message': 'Room not found'}, to=sid)

@game_event
async def toggle_ready(sid, data):
    room_id = data.get('room_id')
    is_ready = data.get('is_ready', False)
    if room_id:
        room = await multiplayer_service.update_player_ready(room_id, sid, is_ready)
        if room:
            await publish_room('room_update', room)
            if room["status"] == "playing":
                await publish_room('game_start', room)
                # System message: mission started
                await emit_system_message(room_id, "MISSION_INITIATED — Decode the cipher")

@game_event
async def submit_guess(sid, data):
    # Rate limit: 5 guesses per 10 seconds
    if await _is_rate_limited(sid, "guess", GUESS_LIMIT):
        await sio.emit('error', 'TOO_MANY_GUESSES_RETRY_LATER', to=sid)
        return {"ok": False}

    room_id = data.get('room_id')
    guess = data.get('guess')
    if room_id and guess:
        room = await multiplayer_service.submit_guess(room_id, sid, guess)
        if room and "error" in room:
            await sio.emit('error', {'message': room['error']}, to=sid)
            return {"ok": False}
        if room:
            await publish_room('room_update', room)
            if room["status"] == "finished":
                await publish_room('game_over', room)
                # System message: game over
                winner_pid = room.get("winner_pid")
                if winner_pid and winner_pid in room.get("players", {}):
                    winner_name = room["players"][winner_pid].get("username", "UNKNOWN")
                    await emit_system_message(room_id, f"MISSION_COMPLETE — {winner_name} cracked the cipher")
                else:
                    await emit_system_message(room_id, "MISSION_COMPLETE — Cipher decoded")
            return {"ok": True}
    await sio.emit('error', {'message': 'Game is not active or player session has changed'}, to=sid)
    return {"ok": False}

@game_event
async def surrender(sid, data):
    room_id = data.get('room_id')
    if room_id:
        room_before = await multiplayer_service.get_room(room_id)
        username = _get_player_username(room_before, sid)
        room = await multiplayer_service.surrender(room_id, sid)
        if room:
            await publish_room('room_update', room)
            await publish_room('game_over', room)
            # System message: surrender
            await emit_system_message(room_id, f"{username} has abandoned the mission")

@game_event
async def chat_message(sid, data):
    """Handle player chat messages with validation."""
    # Rate limit: 10 messages per 10 seconds
    if await _is_rate_limited(sid, "chat", CHAT_LIMIT):
        await sio.emit('error', 'TOO_MANY_MESSAGES_RETRY_LATER', to=sid)
        return

    room_id = data.get('room_id')
    raw_text = data.get('text', '')
    player = await chat_player(sid, room_id)
    if not player or not isinstance(raw_text, str):
        await sio.emit('error', {'message': 'Invalid chat sender or message'}, to=sid)
        return
    text = _sanitize_text(raw_text)
    
    sender_id = player['player_id']
    sender_username = player['username']

    # Validation
    if not room_id or not text:
        await sio.emit('error', {'message': 'EMPTY_MESSAGE_REJECTED'}, to=sid)
        return
    
    if len(text) > MAX_MESSAGE_LENGTH:
        await sio.emit('error', {'message': f'MESSAGE_TOO_LONG: max {MAX_MESSAGE_LENGTH} chars'}, to=sid)
        return

    payload = {
        "sender_id": sender_id,
        "sender_username": sender_username,
        "text": text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": "chat"
    }
    # Broadcast to all in room including sender
    await sio.emit('chat_message', payload, room=room_id)

@game_event
async def send_emoji(sid, data):
    """Handle quick emoji reactions."""
    if await _is_rate_limited(sid, "chat", CHAT_LIMIT):
        await sio.emit('error', {'message': 'TOO_MANY_MESSAGES_RETRY_LATER'}, to=sid)
        return
    room_id = data.get('room_id')
    emoji = data.get('emoji', '')
    player = await chat_player(sid, room_id)
    if not player:
        await sio.emit('error', {'message': 'Invalid chat sender'}, to=sid)
        return
    sender_id = player['player_id']
    sender_username = player['username']

    if not room_id or emoji not in VALID_EMOJIS:
        await sio.emit('error', {'message': 'INVALID_EMOJI'}, to=sid)
        return

    payload = {
        "sender_id": sender_id,
        "sender_username": sender_username,
        "text": emoji,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": "emoji"
    }
    await sio.emit('chat_message', payload, room=room_id)

@game_event
async def request_replay(sid, data):
    room_id = data.get('room_id')
    if room_id:
        room_before = await multiplayer_service.get_room(room_id)
        username = _get_player_username(room_before, sid)
        room = await multiplayer_service.request_replay(room_id, sid)
        if room:
            await publish_room('room_update', room)
            if room["status"] == "playing":
                await publish_room('game_start', room)
                await emit_system_message(room_id, "MISSION_INITIATED — Decode the cipher")
            else:
                # System message: rematch request
                await emit_system_message(room_id, f"{username} requested a rematch")

@game_event
async def get_hint(sid, data):
    room_id = data.get('room_id')
    revealed_indices = data.get('revealed_indices', [])
    if room_id:
        hint = await multiplayer_service.get_hint(room_id, sid, revealed_indices)
        if hint:
            if "error" in hint:
                await sio.emit('error', {'message': hint['error']}, to=sid)
                return
            await sio.emit('hint_received', hint, to=sid)
            # System message: hint used
            room = await multiplayer_service.get_room(room_id)
            await publish_room('room_update', room)
            username = _get_player_username(room, sid)
            await emit_system_message(room_id, f"{username} used an intel hint")


@game_event
async def room_heartbeat(sid, data):
    room_id = sid_to_room.get(sid)
    if room_id:
        await multiplayer_service.keep_alive(room_id, sid)
