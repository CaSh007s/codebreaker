from flask import Flask, render_template, session, request, jsonify
from flask_socketio import SocketIO, join_room, leave_room, emit, send
import game_logic
import random
import uuid
import time

app = Flask(__name__)
app.secret_key = 'codebreaker_static_secret_key'
socketio = SocketIO(app, manage_session=False, cors_allowed_origins="*")

# --- MULTIPLAYER STATE ---
# active_rooms maps room_code -> game_info dict
active_rooms = {}

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
    return render_template('multiplayer_setup.html', room_code=room_code)

@app.route('/multiplayer/lobby', methods=['POST'])
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
        room_code = multiplayer_logic.create_room(active_rooms, session['sid'], username, avatar, mode, secret_code)
        
        return render_template('lobby.html', room_code=room_code, mode_str=mode.title(), opponent=None)
        
    elif action == 'join':
        room_code = request.form.get('room_code')
        success, msg = multiplayer_logic.join_room(active_rooms, room_code, session['sid'], username, avatar)
        if not success:
            return msg, 400
            
        room = active_rooms[room_code]
        host_sid = room['host']
        host = room['players'][host_sid]
        
        # We joined successfully, but emit goes via socket when they actually connect to the page.
        # Wait, the page requires loading first, so the emit happens in the socket event below.
        
        return render_template('lobby.html', room_code=room_code, mode_str=room['mode'].title(), opponent=host)

@app.route('/multiplayer/game/<room_code>')
def multiplayer_game(room_code):
    if room_code not in active_rooms:
        return "Room not found", 404
        
    room = active_rooms[room_code]
    sid = session.get('sid')
    if sid not in room['players']:
        return "Not part of this game", 403
        
    # Get opponent info
    opponent = None
    for pid, pdata in room['players'].items():
        if pid != sid:
            opponent = pdata
            
    length = len(room['secret_code'])
    return render_template('multiplayer_game.html', room_code=room_code, length=length, opponent=opponent, mode=room['mode'])

# --- SOCKET EVENTS ---

@socketio.on('join_lobby')
def on_join_lobby(data):
    room_code = data['room']
    join_room(room_code)
    
    # Check if this room has two players, if so, emit player_joined to the host
    if room_code in active_rooms:
        room = active_rooms[room_code]
        sid = session.get('sid')
        if len(room['players']) == 2:
            guest_data = room['players'][sid] if sid != room['host'] else None
            # If the current socket is the guest joining, notify the host
            if guest_data:
                emit('player_joined', {'username': guest_data['username'], 'avatar': guest_data['avatar']}, room=room_code)
                
            # Both players are here, start game!
            import multiplayer_logic
            multiplayer_logic.start_game(active_rooms, room_code)
            emit('game_start', room=room_code)

@socketio.on('join_game')
def on_join_game(data):
    room_code = data['room']
    join_room(room_code)
    
@socketio.on('send_chat')
def on_chat(data):
    room_code = data['room']
    msg = data['msg']
    username = session.get('username', 'Player')
    avatar = session.get('avatar', 'default')
    emit('receive_chat', {'username': username, 'avatar': avatar, 'msg': msg}, room=room_code)

@socketio.on('submit_guess')
def on_submit_guess(data):
    room_code = data['room']
    guess = data['guess']
    
    if room_code not in active_rooms:
        return
        
    room = active_rooms[room_code]
    sid = session.get('sid')
    if sid not in room['players']:
        return
        
    player = room['players'][sid]
    secret = room['secret_code']
    
    is_valid, msg = game_logic.validate_input(guess, len(secret))
    if not is_valid:
        emit('guess_result', {'valid': False, 'message': msg})
        return
        
    result = game_logic.check_guess(secret, guess)
    player['attempts'] += 1
    
    is_win = (result['bulls'] == len(secret))
    
    # Send result back to the player
    emit('guess_result', {'valid': True, 'result': result, 'guess': guess})
    
    if is_win:
        player['status'] = 'won'
        player['finish_time'] = time.time()
        emit('game_over', {
            'winner': player['username'],
            'winner_sid': sid,
            'secret_code': secret,
            'attempts': player['attempts']
        }, room=room_code)
        room['status'] = 'finished'
    else:
        # Broadcast that opponent made a guess
        emit('opponent_guess', {
            'player_sid': sid,
            'attempts': player['attempts'],
            'result': result
        }, room=room_code)

# --- API ENDPOINTS ---

@app.route('/api/new_game', methods=['POST'])
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
    print("👉 Open your browser to: http://127.0.0.1:5000")
    print("="*50 + "\n")
    socketio.run(app, debug=True)