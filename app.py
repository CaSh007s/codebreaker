from flask import Flask, render_template, session, request, jsonify
import game_logic
import random

app = Flask(__name__)
app.secret_key = 'codebreaker_static_secret_key'

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
    app.run(debug=True)