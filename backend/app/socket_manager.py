import socketio
import os
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
GUESS_LIMIT = 5
RATE_LIMIT_WINDOW = 10


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


@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    room_id = sid_to_room.get(sid)
    if room_id:
        room_before = multiplayer_service.get_room(room_id)
        username = _get_player_username(room_before, sid)
        
        # We still notify the room even if leave_room doesn't change anything
        # as the player is still physically gone from the socket.
        await emit_system_message(room_id, f"{username} lost connection")
        
        room = multiplayer_service.leave_room(room_id, sid)
        if room:
            await sio.emit('room_update', room, room=room_id)
            
        del sid_to_room[sid]
    print(f"Client disconnected: {sid}")

@sio.event
async def init_room(sid, data):
    room_id = data.get('room_id')
    config = data.get('config')
    if room_id and config:
        # Check if room already exists — don't overwrite!
        existing = multiplayer_service.get_room(room_id)
        if existing:
            # Identity-based "Room Full" check
            player_info = data.get('player_info', {})
            player_id = player_info.get('player_id')
            
            is_returning = player_id and player_id in existing.get("players", {})
            if len(existing["players"]) >= 2 and not is_returning:
                await sio.emit('error', {'message': 'Room is full'}, to=sid)
                return
            
            await sio.enter_room(sid, room_id)
            sid_to_room[sid] = room_id
            
            # Host Refresh Recovery: If info is present, update SID
            if is_returning:
                room = multiplayer_service.join_room(room_id, sid, player_info)
                if room:
                    existing = room # Use the updated state
                    # System message: reconnected
                    username = player_info.get("username", "UNKNOWN")
                    await emit_system_message(room_id, f"{username} re-established uplink")

            await sio.emit('room_update', existing, to=sid)
        else:
            # Create a brand new room
            room = multiplayer_service.create_room(room_id, config)
            await sio.enter_room(sid, room_id)
            sid_to_room[sid] = room_id
            await sio.emit('room_update', room, room=room_id)

@sio.event
async def join_room(sid, data):
    room_id = data.get('room_id')
    if room_id:
        room = multiplayer_service.get_room(room_id)
        if not room:
            # Silent skip if room doesn't exist yet to avoid race conditions with init_room
            return

        # Identity-based "Room Full" check
        player_info = data.get('player_info', {})
        player_id = player_info.get('player_id')
        is_returning = player_id and player_id in room.get("players", {})

        if len(room["players"]) >= 2 and not is_returning:
            await sio.emit('error', {'message': 'Room is full'}, to=sid)
            return
 
        await sio.enter_room(sid, room_id)
        sid_to_room[sid] = room_id
        
        # If client sent player_info, try to re-join/update SID
        if player_info and player_id:
            updated_room = multiplayer_service.join_room(room_id, sid, player_info)
            if updated_room and "error" not in updated_room:
                await sio.emit('room_update', updated_room, room=room_id)
                
                # System message: reconnected
                if is_returning:
                    username = player_info.get("username", "UNKNOWN")
                    await emit_system_message(room_id, f"{username} re-established uplink")
                return
            elif updated_room:
                 room = updated_room
 
        # Otherwise just send the current room state
        await sio.emit('room_update', room, to=sid)

@sio.event
async def setup_player(sid, data):
    room_id = data.get('room_id')
    player_info = data.get('player_info')
    if room_id and player_info:
        room = multiplayer_service.register_player(room_id, sid, player_info)
        if room and "error" in room:
            await sio.emit('error', room, to=sid)
        elif room:
            await sio.emit('room_update', room, room=room_id)
            # System message: player joined
            username = player_info.get("username", "UNKNOWN")
            await emit_system_message(room_id, f"{username} joined the uplink")

@sio.event
async def toggle_ready(sid, data):
    room_id = data.get('room_id')
    is_ready = data.get('is_ready', False)
    if room_id:
        room = multiplayer_service.update_player_ready(room_id, sid, is_ready)
        if room:
            await sio.emit('room_update', room, room=room_id)
            if room["status"] == "playing":
                await sio.emit('game_start', room, room=room_id)
                # System message: mission started
                await emit_system_message(room_id, "MISSION_INITIATED — Decode the cipher")

@sio.event
async def submit_guess(sid, data):
    # Rate limit: 5 guesses per 10 seconds
    if await _is_rate_limited(sid, "guess", GUESS_LIMIT):
        await sio.emit('error', 'TOO_MANY_GUESSES_RETRY_LATER', to=sid)
        return

    room_id = data.get('room_id')
    guess = data.get('guess')
    if room_id and guess:
        room = multiplayer_service.submit_guess(room_id, sid, guess)
        if room:
            await sio.emit('room_update', room, room=room_id)
            if room["status"] == "finished":
                await sio.emit('game_over', room, room=room_id)
                # System message: game over
                winner_pid = room.get("winner_pid")
                if winner_pid and winner_pid in room.get("players", {}):
                    winner_name = room["players"][winner_pid].get("username", "UNKNOWN")
                    await emit_system_message(room_id, f"MISSION_COMPLETE — {winner_name} cracked the cipher")
                else:
                    await emit_system_message(room_id, "MISSION_COMPLETE — Cipher decoded")

@sio.event
async def surrender(sid, data):
    room_id = data.get('room_id')
    if room_id:
        room_before = multiplayer_service.get_room(room_id)
        username = _get_player_username(room_before, sid)
        room = multiplayer_service.surrender(room_id, sid)
        if room:
            await sio.emit('room_update', room, room=room_id)
            await sio.emit('game_over', room, room=room_id)
            # System message: surrender
            await emit_system_message(room_id, f"{username} has abandoned the mission")

@sio.event
async def chat_message(sid, data):
    """Handle player chat messages with validation."""
    # Rate limit: 10 messages per 10 seconds
    if await _is_rate_limited(sid, "chat", CHAT_LIMIT):
        await sio.emit('error', 'TOO_MANY_MESSAGES_RETRY_LATER', to=sid)
        return

    room_id = data.get('room_id')
    raw_text = data.get('text', '')
    text = _sanitize_text(raw_text)
    
    sender_id = data.get('sender_id', '')
    sender_username = data.get('sender_username', 'UNKNOWN')

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

@sio.event
async def send_emoji(sid, data):
    """Handle quick emoji reactions."""
    room_id = data.get('room_id')
    emoji = data.get('emoji', '')
    sender_id = data.get('sender_id', '')
    sender_username = data.get('sender_username', 'UNKNOWN')

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

@sio.event
async def request_replay(sid, data):
    room_id = data.get('room_id')
    if room_id:
        room_before = multiplayer_service.get_room(room_id)
        username = _get_player_username(room_before, sid)
        room = multiplayer_service.request_replay(room_id, sid)
        if room:
            await sio.emit('room_update', room, room=room_id)
            if room["status"] == "playing":
                await sio.emit('game_start', room, room=room_id)
                await emit_system_message(room_id, "MISSION_INITIATED — Decode the cipher")
            else:
                # System message: rematch request
                await emit_system_message(room_id, f"{username} requested a rematch")

@sio.event
async def get_hint(sid, data):
    room_id = data.get('room_id')
    revealed_indices = data.get('revealed_indices', [])
    if room_id:
        hint = multiplayer_service.get_hint(room_id, sid, revealed_indices)
        if hint:
            await sio.emit('hint_received', hint, to=sid)
            # System message: hint used
            room = multiplayer_service.get_room(room_id)
            username = _get_player_username(room, sid)
            await emit_system_message(room_id, f"{username} used an intel hint")
