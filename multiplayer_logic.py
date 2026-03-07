import string
import random
import time

def generate_room_code(length=5):
    """Generate a random alphanumeric room code."""
    characters = string.ascii_uppercase + string.digits
    return ''.join(random.choice(characters) for _ in range(length))

import json

def get_room(redis_client, room_code):
    """Internal helper to get room data from Redis."""
    data = redis_client.get(f"room:{room_code}")
    if data:
        return json.loads(data)
    return None

def save_room(redis_client, room_code, room_data):
    """Internal helper to save room data to Redis with a 24-hour expiration."""
    redis_client.setex(f"room:{room_code}", 86400, json.dumps(room_data))

def create_room(redis_client, host_sid, username, avatar, mode, secret_code):
    """Creates a new multiplayer room in Redis."""
    room_code = generate_room_code()
    # Ensure uniqueness
    while redis_client.exists(f"room:{room_code}"):
        room_code = generate_room_code()

    room_data = {
        'status': 'waiting',
        'mode': mode,
        'secret_code': secret_code,
        'players': {
            host_sid: {
                'username': username,
                'avatar': avatar,
                'attempts': 0,
                'status': 'playing',
                'finish_time': None
            }
        },
        'host': host_sid,
        'start_time': None,
        'created_at': time.time()
    }
    save_room(redis_client, room_code, room_data)
    return room_code

def join_room(redis_client, room_code, guest_sid, username, avatar):
    """Allows a guest to join an existing room in Redis."""
    room = get_room(redis_client, room_code)
    if not room:
        return False, "Room not found."
    
    if room['status'] != 'waiting':
        return False, "Game already started or finished."
    
    if len(room['players']) >= 2:
        return False, "Room is full."

    room['players'][guest_sid] = {
        'username': username,
        'avatar': avatar,
        'attempts': 0,
        'status': 'playing',
        'finish_time': None
    }
    save_room(redis_client, room_code, room)
    return True, "Joined"

def start_game(redis_client, room_code):
    """Starts the game when both players are ready in Redis."""
    room = get_room(redis_client, room_code)
    if room:
        room['status'] = 'playing'
        room['start_time'] = time.time()
        save_room(redis_client, room_code, room)
        return True
    return False
