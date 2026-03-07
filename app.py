from flask import Flask, render_template, session, request, jsonify
from flask_socketio import SocketIO, join_room, leave_room, emit, send
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import game_logic
import random
import uuid
import time
import os
import threading

import redis
import json

# Setup Redis Client
redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379')
# Fallback for local dev if redis is not running
try:
    r = redis.Redis.from_url(redis_url, decode_responses=True)
    r.ping()
    use_redis = True
except Exception as e:
    print(f"⚠️ Redis connection failed: {e}. Falling back to in-memory state (not compatible with multiple workers).")
    use_redis = False
    class MockRedis:
        def __init__(self): self.data = {}
        def get(self, k): return self.data.get(k)
        def set(self, k, v): self.data[k] = v
        def setex(self, k, t, v): self.data[k] = v
        def exists(self, k): return k in self.data
        def delete(self, k): self.data.pop(k, None)
        def keys(self, p): return [k for k in self.data.keys() if k.startswith(p.replace('*',''))]
    r = MockRedis()

def cleanup_stale_rooms():
    """Background task to remove rooms that are empty or stale using Redis scanning."""
    while True:
        time.sleep(300) # check every 5 minutes
        now = time.time()
        room_keys = r.keys("room:*")
        for key in room_keys:
            data = r.get(key)
            if not data: continue
            room = json.loads(data)
            players = room.get('players', {})
            
            # 1. Dissolve if empty (0 players)
            if not players:
                r.delete(key)
                continue
                
            # 2. Dissolve if stale (e.g., created > 15 mins ago and all players are disconnected)
            start = room.get('start_time') or room.get('created_at', now)
            all_disconnected = all(p.get('disconnected', False) for p in players.values())
            
            if now - start > 900 and all_disconnected: # 15 minutes limit + all disconnected
                r.delete(key)

# Start the background thread
cleanup_thread = threading.Thread(target=cleanup_stale_rooms, daemon=True)
cleanup_thread.start()

app = Flask(__name__)
app.secret_key = 'codebreaker_static_secret_key'

# Setup Rate Limiting
limiter = Limiter(
    get_remote_address,
    app=app,
    storage_uri=redis_url if use_redis else "memory://",
    default_limits=["200 per day", "50 per hour"]
)

# SocketIO with Redis Message Queue for multi-worker support
socketio_kwargs = {"manage_session": False, "cors_allowed_origins": "*"}
if use_redis:
    socketio_kwargs["message_queue"] = redis_url

socketio = SocketIO(app, **socketio_kwargs)

# --- MULTIPLAYER STATE ---
# Now moved to Redis (r)

@app.route('/')
def index():
    return render_template('index.html')

# --- GAME ROUTES ---

@app.route('/game/rookie')
def game_rookie():
    session['mode'] = 'rookie'
    
    current_code = session.get('secret_code', '')
    is_over = session.get('game_over', False)
    
    if len(current_code) != 3 or is_over:
        session['secret_code'] = game_logic.generate_secret_code(3, False)
        session['attempts'] = 0
        session['max_attempts'] = 10
        session['game_over'] = False
        session['revealed_indices'] = []
        session['outcome'] = None
        
    time_limit = session.get('time_limit', 0)
    max_attempts = session.get('max_attempts', 10)
    return render_template('rookie.html', time_limit=time_limit, max_attempts=max_attempts)

@app.route('/game/standard')
def game_standard():
    session['mode'] = 'standard'
    
    current_code = session.get('secret_code', '')
    is_over = session.get('game_over', False)
    
    if len(current_code) != 4 or is_over:
        session['secret_code'] = game_logic.generate_secret_code(4, False)
        session['attempts'] = 0
        session['max_attempts'] = 10
        session['game_over'] = False
        session['revealed_indices'] = []
        session['outcome'] = None

    time_limit = session.get('time_limit', 0)
    max_attempts = session.get('max_attempts', 10)
    return render_template('standard.html', time_limit=time_limit, max_attempts=max_attempts)

@app.route('/game/expert')
def game_expert():
    session['mode'] = 'expert'
    
    current_code = session.get('secret_code', '')
    is_over = session.get('game_over', False)
    
    if len(current_code) != 5 or is_over:
        session['secret_code'] = game_logic.generate_secret_code(5, False)
        session['attempts'] = 0
        session['max_attempts'] = 12
        session['game_over'] = False
        session['revealed_indices'] = []
        session['outcome'] = None

    time_limit = session.get('time_limit', 0)
    max_attempts = session.get('max_attempts', 12)
    return render_template('expert.html', time_limit=time_limit, max_attempts=max_attempts)

@app.route('/game/master')
def game_master():
    session['mode'] = 'master'
    
    current_code = session.get('secret_code', '')
    is_over = session.get('game_over', False)
    
    if len(current_code) != 4 or is_over:
        session['secret_code'] = game_logic.generate_secret_code(4, True)
        session['attempts'] = 0
        session['max_attempts'] = 12
        session['game_over'] = False
        session['revealed_indices'] = []
        session['outcome'] = None

    time_limit = session.get('time_limit', 0)
    max_attempts = session.get('max_attempts', 12)
    return render_template('master.html', time_limit=time_limit, max_attempts=max_attempts)

@app.route('/game/insane')
def game_insane():
    session['mode'] = 'insane'
    
    current_code = session.get('secret_code', '')
    is_over = session.get('game_over', False)
    
    if len(current_code) != 6 or is_over:
        session['secret_code'] = game_logic.generate_secret_code(6, True)
        session['attempts'] = 0
        session['max_attempts'] = 15
        session['game_over'] = False
        session['revealed_indices'] = []
        session['outcome'] = None

    time_limit = session.get('time_limit', 0)
    max_attempts = session.get('max_attempts', 15)
    return render_template('insane.html', time_limit=time_limit, max_attempts=max_attempts)

@app.route('/result')
def result_page():
    outcome = session.get('outcome', 'loss')
    code = session.get('secret_code', '????')
    mode = session.get('mode', 'standard')
    return render_template('result.html', outcome=outcome, code=code, mode=mode)

# --- MULTIPLAYER ROUTES ---

@app.route('/multiplayer/setup')
def multiplayer_setup():
    return render_template('multiplayer_setup.html', room_code=None)

@app.route('/multiplayer/join/<room_code>')
def join_multiplayer(room_code):
    import multiplayer_logic
    room = multiplayer_logic.get_room(r, room_code)
    if room:
        if len(room['players']) >= 2:
            # Check if this user is already in the room (reconnecting)
            if session.get('sid') not in room['players']:
                return render_template('room_full.html')
    return render_template('multiplayer_setup.html', room_code=room_code)

@app.route('/multiplayer/lobby', methods=['POST'])
@limiter.limit("10 per minute")
def view_lobby():
    action = request.form.get('action')
    username = request.form.get('username')
    avatar = request.form.get('avatar_seed')
    
    session['username'] = username
    session['avatar'] = avatar
    session['sid'] = str(uuid.uuid4()) # simple distinct id for session

    import multiplayer_logic

    if action == 'create':
        mode = request.form.get('mode', 'standard')
        length = 4
        repeats = False
        if mode == 'rookie': length = 3
        elif mode == 'expert': length = 5
        elif mode == 'master': length = 4; repeats = True
        elif mode == 'insane': length = 6; repeats = True
        
        secret_code = game_logic.generate_secret_code(length, repeats)
        room_code = multiplayer_logic.create_room(r, session['sid'], username, avatar, mode, secret_code)
        
        return render_template('lobby.html', room_code=room_code, mode_str=mode.title(), opponent=None)
        
    elif action == 'join':
        room_code = request.form.get('room_code')
        success, msg = multiplayer_logic.join_room(r, room_code, session['sid'], username, avatar)
        if not success:
            if msg == "Room is full.":
                return render_template('room_full.html')
            return msg, 400
            
        room = multiplayer_logic.get_room(r, room_code)
        host_sid = room['host']
        host = room['players'][host_sid]
        
        return render_template('lobby.html', room_code=room_code, mode_str=room['mode'].title(), opponent=host)

@app.route('/multiplayer/game/<room_code>')
def multiplayer_game(room_code):
    import multiplayer_logic
    room = multiplayer_logic.get_room(r, room_code)
    if not room:
        return "Room not found", 404
        
    sid = session.get('sid')
    if sid not in room['players']:
        return "Not part of this game", 403
        
    # Get opponent info
    opponent = None
    my_data = room['players'][sid]
    for pid, pdata in room['players'].items():
        if pid != sid:
            opponent = pdata
            
    length = len(room['secret_code'])
    return render_template('multiplayer_game.html', room_code=room_code, length=length, opponent=opponent, mode=room['mode'], my_history=my_data.get('history', []))

# --- SOCKET EVENTS ---

@socketio.on('join_lobby')
def on_join_lobby(data):
    room_code = data['room']
    join_room(room_code)
    
    import multiplayer_logic
    room = multiplayer_logic.get_room(r, room_code)
    if room:
        sid = session.get('sid')
        # Mark as not ready initially
        if sid in room['players']:
            room['players'][sid]['lobby_ready'] = False
            multiplayer_logic.save_room(r, room_code, room)
            
        if len(room['players']) == 2:
            guest_data = room['players'][sid] if sid != room['host'] else None
            # If the current socket is the guest joining, notify the host
            if guest_data:
                emit('player_joined', {'username': guest_data['username'], 'avatar': guest_data['avatar']}, room=room_code, include_self=False)

@socketio.on('player_ready_lobby')
def on_player_ready_lobby(data):
    room_code = data['room']
    sid = session.get('sid')
    
    import multiplayer_logic
    room = multiplayer_logic.get_room(r, room_code)
    if room:
        if sid in room['players']:
            room['players'][sid]['lobby_ready'] = True
            
            # Check if both players are ready
            if len(room['players']) == 2 and all(p.get('lobby_ready') for p in room['players'].values()):
                multiplayer_logic.start_game(r, room_code)
                emit('game_start', room=room_code)
            else:
                multiplayer_logic.save_room(r, room_code, room)
                emit('lobby_player_ready', {'player_sid': sid}, room=room_code, include_self=False)

@socketio.on('join_game')
def on_join_game(data):
    room_code = data['room']
    join_room(room_code)
    
    import multiplayer_logic
    room = multiplayer_logic.get_room(r, room_code)
    if room and room['status'] == 'playing':
        sid = session.get('sid')
        player = room['players'].get(sid)
        
        # Sync current room wins to the client
        wins = {pid: pdata.get('wins', 0) for pid, pdata in room['players'].items()}
        emit('sync_stats', {'wins': wins}, room=sid)
        
        # Only notify "reconnected" if they actually disconnected previously
        if player and player.get('disconnected'):
            player['disconnected'] = False
            multiplayer_logic.save_room(r, room_code, room)
            emit('opponent_reconnected', {'username': player['username']}, room=room_code, include_self=False)

@socketio.on('leave_match')
def on_leave_match(data):
    room_code = data.get('room')
    sid = session.get('sid')
    import multiplayer_logic
    room = multiplayer_logic.get_room(r, room_code)
    if room:
        if sid in room['players']:
            del room['players'][sid]
            # If no players left, or if game was finished and one leaves, we can cleanup
            if not room['players'] or room['status'] == 'finished':
                r.delete(f"room:{room_code}")
            else:
                multiplayer_logic.save_room(r, room_code, room)
        leave_room(room_code)
    
@socketio.on('send_chat')
def on_chat(data):
    room_code = data['room']
    msg = data['msg']
    username = session.get('username', 'Player')
    avatar = session.get('avatar', 'default')
    sid = session.get('sid')
    emit('receive_chat', {'username': username, 'avatar': avatar, 'msg': msg, 'player_sid': sid}, room=room_code)

@socketio.on('submit_guess')
def on_submit_guess(data):
    room_code = data['room']
    guess = data['guess']
    
    import multiplayer_logic
    room = multiplayer_logic.get_room(r, room_code)
    if not room: return
        
    sid = session.get('sid')
    if sid not in room['players']: return
        
    player = room['players'][sid]
    secret = room['secret_code']
    
    is_valid, msg = game_logic.validate_input(guess, len(secret))
    if not is_valid:
        emit('guess_result', {'valid': False, 'message': msg})
        return
        
    result = game_logic.check_guess(secret, guess)
    player['attempts'] += 1
    
    if 'history' not in player:
        player['history'] = []
    player['history'].append({'guess': guess, 'result': result})
    
    is_win = (result['bulls'] == len(secret))
    
    # Send result back to the player
    emit('guess_result', {'valid': True, 'result': result, 'guess': guess})
    
    if is_win:
        room['status'] = 'finished'
        player['status'] = 'finished'
        player['finish_time'] = time.time()
        
        # Increment internal win stat dynamically
        if 'wins' not in player:
            player['wins'] = 0
        player['wins'] += 1
        
        # Find opponent for game_over emit
        opponent_name = 'Your Opponent'
        for pid, pdata in room['players'].items():
            if pid != sid:
                opponent_name = pdata['username']
                break

        multiplayer_logic.save_room(r, room_code, room)
        emit('game_over', {
            'winner': player['username'],
            'winner_sid': sid,
            'loser': opponent_name,
            'secret_code': secret,
            'attempts': player['attempts']
        }, room=room_code)
    else:
        multiplayer_logic.save_room(r, room_code, room)
        # Broadcast that opponent made a guess
        emit('opponent_guess', {
            'player_sid': sid,
            'attempts': player['attempts'],
            'result': result
        }, room=room_code)

@socketio.on('disconnect')
def on_disconnect():
    sid = session.get('sid')
    if not sid: return
        
    import multiplayer_logic
    room_keys = r.keys("room:*")
    for key in room_keys:
        room_code = key.split(":")[-1]
        room = multiplayer_logic.get_room(r, room_code)
        if room and sid in room['players']:
            room['players'][sid]['disconnected'] = True
            multiplayer_logic.save_room(r, room_code, room)
            if len(room['players']) > 1:
                emit('opponent_disconnected', {'username': room['players'][sid]['username']}, room=room_code)

@socketio.on('surrender_game')
def on_surrender(data):
    room_code = data['room']
    import multiplayer_logic
    room = multiplayer_logic.get_room(r, room_code)
    if not room: return
    sid = session.get('sid')
    if sid not in room['players']: return
    
    surrendering_player = room['players'][sid]
    
    # Find opponent
    winner = None
    winner_sid = None
    for pid, pdata in room['players'].items():
        if pid != sid:
            winner = pdata
            winner_sid = pid
            
    if winner:
        room['status'] = 'finished'
        surrendering_player['status'] = 'finished'
        winner['status'] = 'finished'
        
        if 'wins' not in winner: winner['wins'] = 0
        winner['wins'] += 1
        
        multiplayer_logic.save_room(r, room_code, room)
        emit('game_over', {
            'winner': winner['username'],
            'winner_sid': winner_sid,
            'loser': surrendering_player['username'],
            'secret_code': room['secret_code'],
            'attempts': surrendering_player['attempts']
        }, room=room_code)

@socketio.on('request_rematch')
def on_request_rematch(data):
    room_code = data['room']
    import multiplayer_logic
    room = multiplayer_logic.get_room(r, room_code)
    if not room: return
    sid = session.get('sid')
    if sid not in room['players']: return
    
    player = room['players'][sid]
    player['rematch_requested'] = True
    
    # Check if both players requested a rematch
    if len(room['players']) == 2 and all(p.get('rematch_requested') for p in room['players'].values()):
        mode = room['mode']
        length = 4
        repeats = False
        if mode == 'rookie': length = 3
        elif mode == 'expert': length = 5
        elif mode == 'master': length = 4; repeats = True
        elif mode == 'insane': length = 6; repeats = True
        
        new_code = game_logic.generate_secret_code(length, repeats)
        room['secret_code'] = new_code
        room['status'] = 'playing'
        
        for p in room['players'].values():
            p['attempts'] = 0
            p['status'] = 'playing'
            p['finish_time'] = None
            p['rematch_requested'] = False
            p['history'] = []
            
        multiplayer_logic.save_room(r, room_code, room)
        emit('rematch_accepted', room=room_code)
    else:
        multiplayer_logic.save_room(r, room_code, room)
        emit('rematch_requested', {'player_sid': sid, 'username': player['username']}, room=room_code)

# --- API ENDPOINTS ---

@app.route('/api/new_game', methods=['POST'])
@limiter.limit("20 per minute")
def new_game():
    data = request.json
    length = int(data.get('length', 4))
    repeats = data.get('repeats', False)
    max_attempts = int(data.get('max_attempts', 10))
    timer_seconds = int(data.get('timer', 0))
    mode_name = data.get('mode', 'standard')

    secret_code = game_logic.generate_secret_code(length, repeats)
    
    session['secret_code'] = secret_code
    session['attempts'] = 0
    session['max_attempts'] = max_attempts
    session['game_over'] = False
    session['revealed_indices'] = []
    session['time_limit'] = timer_seconds
    session['outcome'] = None
    session['mode'] = mode_name
    
    return jsonify({'status': 'success'})

@app.route('/api/guess', methods=['POST'])
@limiter.limit("5 per second")
def process_guess():
    if 'secret_code' not in session: return jsonify({'error': 'No active game'}), 400
    
    user_guess = request.json.get('guess', '')
    secret = session['secret_code']
    
    is_valid, message = game_logic.validate_input(user_guess, len(secret))
    if not is_valid: return jsonify({'valid': False, 'message': message})

    result = game_logic.check_guess(secret, user_guess)
    session['attempts'] += 1
    
    is_win = (result['bulls'] == len(secret))
    is_loss = (session['attempts'] >= session['max_attempts'] and not is_win)
    
    if is_win:
        session['outcome'] = 'win'
    elif is_loss:
        session['outcome'] = 'loss'
        
    return jsonify({
        'valid': True,
        'result': result,
        'game_over': is_win or is_loss,
        'won': is_win,
        'secret_code': secret if (is_win or is_loss) else None
    })

@app.route('/api/hint', methods=['POST'])
def get_hint():
    if 'secret_code' not in session: return jsonify({'error': 'No game'}), 400
    
    secret = session['secret_code']
    revealed = session.get('revealed_indices', [])
    
    if len(revealed) >= 2:
        return jsonify({'message': 'No hints remaining! You are on your own.'}), 200
    
    available = [i for i in range(len(secret)) if i not in revealed]
    if not available: return jsonify({'message': 'All numbers revealed!'}), 200
    
    idx = random.choice(available)
    revealed.append(idx)
    session['revealed_indices'] = revealed
    
    return jsonify({'index': idx, 'number': secret[idx]})

@app.route('/api/surrender', methods=['POST'])
def surrender():
    if 'secret_code' not in session: return jsonify({'error': 'No game'}), 400
    
    session['outcome'] = 'loss'
    session['game_over'] = True
    
    return jsonify({'secret_code': session['secret_code']})

if __name__ == '__main__':
    print("\n" + "="*50)
    print("🚀 CODEBREAKER MULTIPLAYER IS LIVE!")
    print("👉 Open your browser to: http://127.0.0.1:5001")
    print("="*50 + "\n")
    socketio.run(app, debug=True, port=5001)