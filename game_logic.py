import random

def generate_secret_code(length=4, allow_repeats=False):
    """
    Generates a secret code string.
    """
    if allow_repeats:
        # Pick any digit 'length' times
        code = [str(random.randint(0, 9)) for _ in range(length)]
    else:
        # Pick unique digits
        code = random.sample('0123456789', length)
    
    return "".join(code)

def check_guess(secret, guess):
    """
    Compares the guess against the secret code.
    Returns a dictionary with 'bulls' and 'cows'.
    """
    bulls = 0
    cows = 0
    
    # This prevents the "IndexError" that causes the empty row bug
    safe_length = min(len(secret), len(guess))
    
    secret_list = list(secret)
    guess_list = list(guess)
    
    secret_remaining = []
    guess_remaining = []

    # STEP 1: Find Bulls (Exact Match)
    for i in range(safe_length):
        if guess_list[i] == secret_list[i]:
            bulls += 1
        else:
            secret_remaining.append(secret_list[i])
            guess_remaining.append(guess_list[i])
            
    # If the user guessed extra numbers or fewer numbers, handle those
    if len(guess) > len(secret):
        guess_remaining.extend(guess_list[len(secret):])
    elif len(secret) > len(guess):
        secret_remaining.extend(secret_list[len(guess):])

    # STEP 2: Find Cows (Wrong Position)
    for digit in guess_remaining:
        if digit in secret_remaining:
            cows += 1
            secret_remaining.remove(digit)

    return {"bulls": bulls, "cows": cows}

def validate_input(guess, length):
    """
    Helper to check if the user input is valid.
    """
    if not guess.isdigit():
        return False, "Input must be numbers only."
    if len(guess) != length:
        return False, f"Input must be exactly {length} digits."
    return True, "Valid"