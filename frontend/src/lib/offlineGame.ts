export type OfflineGameStatus = "active" | "solved" | "failed" | "surrendered";

export interface OfflineGameState {
  gameId: string;
  secretCode: string;
  codeLength: number;
  allowRepeats: boolean;
  maxAttempts: number | null;
  timeLimit: number | null;
  createdAt: number;
  status: OfflineGameStatus;
  attempts: number;
  feedbackMap: number[];
  revealedIndices: number[];
  guesses: { guess: string; feedback: string[] }[];
}

export function createOfflineGame(
  codeLength: number,
  maxAttempts: number | undefined,
  allowRepeats: boolean,
  timeLimit: number | undefined,
): OfflineGameState {
  const digits = "0123456789";
  const available = digits.split("");
  let secretCode = "";
  for (let index = 0; index < codeLength; index += 1) {
    const choice = Math.floor(Math.random() * available.length);
    secretCode += available[choice];
    if (!allowRepeats) available.splice(choice, 1);
  }
  return {
    gameId: `offline:${makeId()}`,
    secretCode,
    codeLength,
    allowRepeats,
    maxAttempts: maxAttempts ?? null,
    timeLimit: timeLimit ?? null,
    createdAt: Date.now(),
    status: "active",
    attempts: 0,
    feedbackMap: shuffle(Array.from({ length: codeLength }, (_, i) => i)),
    revealedIndices: [],
    guesses: [],
  };
}

export function evaluateGuess(secret: string, guess: string) {
  const secretCounts = new Map<string, number>();
  const guessCounts = new Map<string, number>();
  let bulls = 0;
  for (let index = 0; index < secret.length; index += 1) {
    if (secret[index] === guess[index]) bulls += 1;
    increment(secretCounts, secret[index]);
    increment(guessCounts, guess[index]);
  }
  let matches = 0;
  for (const [digit, count] of secretCounts) {
    matches += Math.min(count, guessCounts.get(digit) ?? 0);
  }
  const cows = matches - bulls;
  return { bulls, cows, gray: guess.length - matches };
}

export function feedbackForGuess(game: OfflineGameState, guess: string) {
  const positional = Array<string>(game.codeLength).fill("gray");
  const remaining = new Map<string, number>();
  for (const digit of game.secretCode) increment(remaining, digit);
  for (let index = 0; index < game.codeLength; index += 1) {
    if (guess[index] === game.secretCode[index]) {
      positional[index] = "bull";
      remaining.set(guess[index], (remaining.get(guess[index]) ?? 1) - 1);
    }
  }
  for (let index = 0; index < game.codeLength; index += 1) {
    if (positional[index] === "bull") continue;
    const count = remaining.get(guess[index]) ?? 0;
    if (count > 0) {
      positional[index] = "cow";
      remaining.set(guess[index], count - 1);
    }
  }
  return game.feedbackMap.map((index) => positional[index]);
}

export function submitOfflineGuess(game: OfflineGameState, guess: string) {
  if (game.status !== "active") throw new Error("Game is no longer active");
  if (!/^\d+$/.test(guess) || guess.length !== game.codeLength) {
    throw new Error(`Guess must be ${game.codeLength} digits long`);
  }
  if (isExpired(game)) {
    game.status = "failed";
    return { feedback: [], status: game.status, secretCode: game.secretCode, attemptsRemaining: 0 };
  }
  const feedback = feedbackForGuess(game, guess);
  const result = evaluateGuess(game.secretCode, guess);
  game.attempts += 1;
  game.guesses.push({ guess, feedback });
  if (result.bulls === game.codeLength) game.status = "solved";
  else if (game.maxAttempts !== null && game.attempts >= game.maxAttempts) game.status = "failed";
  return {
    feedback,
    status: game.status,
    secretCode: game.status === "active" ? undefined : game.secretCode,
    attemptsRemaining: game.maxAttempts === null ? null : Math.max(0, game.maxAttempts - game.attempts),
  };
}

export function getOfflineHint(game: OfflineGameState) {
  if (game.status !== "active") throw new Error("Game is no longer active");
  if (isExpired(game)) {
    game.status = "failed";
    throw new Error("Timer has expired");
  }
  if (game.revealedIndices.length >= Math.max(0, game.codeLength - 2)) {
    throw new Error("At least 2 digits must remain unrevealed");
  }
  const available = Array.from({ length: game.codeLength }, (_, i) => i).filter(
    (index) => !game.revealedIndices.includes(index),
  );
  const position = available[Math.floor(Math.random() * available.length)];
  game.revealedIndices.push(position);
  return { position, digit: game.secretCode[position] };
}

export function isExpired(game: OfflineGameState) {
  return game.timeLimit !== null && Date.now() - game.createdAt >= game.timeLimit * 1000;
}

function increment(map: Map<string, number>, value: string) {
  map.set(value, (map.get(value) ?? 0) + 1);
}

function shuffle<T>(values: T[]) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}
