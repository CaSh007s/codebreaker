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

    @staticmethod
    def generate_feedback_map(length: int) -> List[int]:
        """Generates a fixed permutation of indices [0..length-1].
        This map stays constant for the entire game, so each feedback 
        dot position always refers to the same digit slot."""
        indices = list(range(length))
        random.shuffle(indices)
        return indices

    @staticmethod
    def evaluate_positional(secret: str, guess: str, feedback_map: List[int]) -> List[str]:
        """Produces per-digit feedback (bull/cow/gray) for each position,
        then permutes the results through the fixed feedback_map.
        
        feedback_map[i] tells us: "output dot i shows the result for digit slot feedback_map[i]"
        """
        from collections import Counter
        length = len(secret)
        
        # Step 1: Determine per-position result
        positional = ["gray"] * length
        secret_counts = Counter(secret)
        
        # First pass: mark bulls
        remaining_secret = Counter(secret)
        for idx in range(length):
            if guess[idx] == secret[idx]:
                positional[idx] = "bull"
                remaining_secret[guess[idx]] -= 1
        
        # Second pass: mark cows (digits present but wrong position)
        for idx in range(length):
            if positional[idx] == "bull":
                continue
            if remaining_secret[guess[idx]] > 0:
                positional[idx] = "cow"
                remaining_secret[guess[idx]] -= 1
            # else stays "gray"
        
        # Step 2: Permute through the fixed map
        # output[i] = positional[feedback_map[i]]
        output = [positional[feedback_map[i]] for i in range(length)]
        return output
