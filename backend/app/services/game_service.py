import random
from typing import List, Tuple
from enum import Enum

class FeedbackType(Enum):
    BULL = "bull"
    COW = "cow"
    GRAY = "gray"

class GameService:
    @staticmethod
    def generate_secret_code(length: int = 4, allow_repeats: bool = True) -> str:
        """Generates a secret numeric code of the given length."""
        if allow_repeats:
            return "".join(str(random.randint(0, 9)) for _ in range(length))
        else:
            # For non-repeating digits, we sample from '0123456789'
            # Note: length must be <= 10
            digits = "0123456789"
            if length > 10:
                raise ValueError("Cannot generate non-repeating code longer than 10 digits")
            return "".join(random.sample(digits, length))

    @staticmethod
    def evaluate_guess(secret: str, guess: str) -> Tuple[int, int, int]:
        """
        Evaluates the guess against the secret code.
        Returns (bulls, cows, grays).
        """
        if len(secret) != len(guess):
            raise ValueError("Guess length must match secret length")

        from collections import Counter
        
        # Calculate bulls: same digit, same position
        bulls = sum(1 for s, g in zip(secret, guess) if s == g)
        
        # Calculate total matches (intersection of multi-sets): 
        # same digit, any position
        secret_counts = Counter(secret)
        guess_counts = Counter(guess)
        total_matches = sum((secret_counts & guess_counts).values())
        
        # Cows are digits in wrong positions
        cows = total_matches - bulls
        grays = len(guess) - total_matches
        
        return int(bulls), int(cows), int(grays)

    @staticmethod
    def shuffle_feedback(bulls: int, cows: int, grays: int) -> List[FeedbackType]:
        """Returns a shuffled list of feedback indicators."""
        feedback = ([FeedbackType.BULL] * bulls + 
                    [FeedbackType.COW] * cows + 
                    [FeedbackType.GRAY] * grays)
        random.shuffle(feedback)
        return feedback
