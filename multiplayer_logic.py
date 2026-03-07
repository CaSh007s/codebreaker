import string
import random
import time

def generate_room_code(length=5):
    """Generate a random alphanumeric room code."""
    characters = string.ascii_uppercase + string.digits
    return ''.join(random.choice(characters) for _ in range(length))

def create_room(active_rooms, host_sid, username, avatar, mode, secret_code):
    """Creates a new multiplayer room."""
    room_code = generate_room_code()
    # Ensure uniqueness just in case
    while room_code in active_rooms:
        room_code = generate_room_code()

    active_rooms[room_code] = {
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
    return room_code

def join_room(active_rooms, room_code, guest_sid, username, avatar):
    """Allows a guest to join an existing room."""
    if room_code not in active_rooms:
        return False, "Room not found."
    
    room = active_rooms[room_code]
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
    return True, "Joined"

def start_game(active_rooms, room_code):
    """Starts the game when both players are ready."""
    if room_code in active_rooms:
        active_rooms[room_code]['status'] = 'playing'
        active_rooms[room_code]['start_time'] = time.time()
        return True
    return False
