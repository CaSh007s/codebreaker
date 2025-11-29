
// 1. CONFIGURATION
// We try to read these from the HTML file. If missing, we use safe defaults.
const gameLength = (typeof CODE_LENGTH !== 'undefined') ? CODE_LENGTH : 4;
const gameTimer  = (typeof TIME_LIMIT !== 'undefined') ? TIME_LIMIT : 0;
const maxTries   = (typeof MAX_ATTEMPTS !== 'undefined') ? MAX_ATTEMPTS : 10;

// 2. STATE VARIABLES
let currentRow = 0;
let currentTile = 0;
let gameOver = false;
let currentGuess = "";
let isSubmitting = false; // The Lock against double-clicks
let timerInterval;
let currentRenderedRows = 0;

// 3. INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    // A. Draw the board based on the specific level settings
    createGrid();
    
    // B. Start the timer if this level has one
    if (gameTimer > 0) {
        startTimer(gameTimer);
    }

    // C. Setup Inputs (The "Ghost Click" Fix)
    setupKeyboard();
    setupHeaderTools();
});

// 4. INPUT HANDLING
function setupKeyboard() {
    const keyboard = document.getElementById("keyboard");
    if (!keyboard) return;

    // PART 1: LEFT CLICK (Type Numbers, Enter, Delete)
    keyboard.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return; 

        e.preventDefault(); 
        btn.blur();         

        const val = btn.innerText.trim(); 

        if (val === "ENTER") {
            submitGuess();
        } else if (val === "DELETE") {
            deleteNumber();
        } else {
            handleInput(val);
        }
    });

    // RIGHT CLICK (Cross out feature)
    keyboard.addEventListener("contextmenu", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;

        e.preventDefault(); // Stop the browser right-click menu
        
        // We only want to cross out Numbers, not ENTER or DELETE
        const val = btn.innerText.trim();
        if (val !== "ENTER" && val !== "DELETE") {
            btn.classList.toggle("crossed-out");
            
            // Optional: Vibrate on mobile for tactile feedback
            if (navigator.vibrate) navigator.vibrate(50);
        }
    });
}

function setupHeaderTools() {
    // Attach listeners to the top-right icons if they exist
    const btnGiveUp = document.getElementById("giveup-btn");
    const btnHint = document.getElementById("hint-btn");
    const btnStats = document.getElementById("stats-btn");
    const btnCloseStats = document.getElementById("close-stats"); // Inside modal

    if(btnGiveUp) btnGiveUp.addEventListener("click", giveUp);
    if(btnHint)   btnHint.addEventListener("click", getHint);
    if(btnStats)  btnStats.addEventListener("click", showStats);
    if(btnCloseStats) btnCloseStats.addEventListener("click", closeStats);
}

// 5. GAME LOGIC

function createGrid() {
    const board = document.getElementById("game-board");
    board.innerHTML = ""; 
    
    currentRenderedRows = 0;

    // STARTING ROWS: 
    // If it's a normal game (e.g. 10 tries), draw all 10.
    // If it's Infinite (10000 tries), ONLY draw 12 to start (performance).
    let rowsToDraw = maxTries;
    if (maxTries > 50) {
        rowsToDraw = 12; 
    }

    for (let i = 0; i < rowsToDraw; i++) {
        addSingleRow(i); // Helper function
    }
}

// Helper to add just ONE row (We extract this so we can reuse it)
function addSingleRow(rowIndex) {
    const board = document.getElementById("game-board");
    const row = document.createElement("div");
    row.classList.add("row");
    row.id = `row-${rowIndex}`;

    for (let j = 0; j < gameLength; j++) {
        const tile = document.createElement("div");
        tile.classList.add("tile");
        tile.id = `row-${rowIndex}-tile-${j}`;
        row.appendChild(tile);
    }

    const feedbackBox = document.createElement("div");
    feedbackBox.classList.add("feedback-box");
    feedbackBox.id = `feedback-${rowIndex}`;
    
    for (let k = 0; k < gameLength; k++) {
        const dot = document.createElement("div");
        dot.classList.add("dot");
        feedbackBox.appendChild(dot);
    }
    
    row.appendChild(feedbackBox);
    board.appendChild(row);
    
    currentRenderedRows++;
}

function handleInput(number) {
    if (gameOver || isSubmitting) return;
    if (currentTile < gameLength) {
        const tile = document.getElementById(`row-${currentRow}-tile-${currentTile}`);
        if(tile) {
            tile.innerText = number;
            tile.classList.add("active");
            currentGuess += number;
            currentTile++;
        }
    }
}

function deleteNumber() {
    if (gameOver || isSubmitting) return;
    if (currentTile > 0) {
        currentTile--;
        const tile = document.getElementById(`row-${currentRow}-tile-${currentTile}`);
        if(tile) {
            tile.innerText = "";
            tile.classList.remove("active");
            currentGuess = currentGuess.slice(0, -1);
        }
    }
}

function submitGuess() {
    if (gameOver || isSubmitting) return;

    // Length Check
    if (currentTile !== gameLength) {
        const row = document.getElementById(`row-${currentRow}`);
        row.classList.add("shake");
        setTimeout(() => row.classList.remove("shake"), 300);
        return;
    }

    // LOCK: Prevent any other clicks while talking to server
    isSubmitting = true;

    fetch('/api/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guess: currentGuess })
    })
    .then(response => response.json())
    .then(data => {
        isSubmitting = false; // UNLOCK

        if (data.valid) {
            updateFeedback(data.result);
            if (data.game_over) {
                endGame(data.won, data.secret_code);
            } else {
                currentRow++;
                currentTile = 0;
                currentGuess = "";

                if (currentRow >= currentRenderedRows - 2 && currentRenderedRows < maxTries) {
                    // Add 5 more rows dynamically
                    for (let k = 0; k < 5; k++) {
                        if (currentRenderedRows < maxTries) {
                            addSingleRow(currentRenderedRows);
                        }
                    }
                }

                const nextRow = document.getElementById(`row-${currentRow}`);
                if (nextRow) {
                    nextRow.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }
        } else {
            alert(data.message);
        }
    })
    .catch(err => {
        isSubmitting = false;
        console.error(err);
    });
}

function updateFeedback(result) {
    const feedbackBox = document.getElementById(`feedback-${currentRow}`);
    if (!feedbackBox) return;
    feedbackBox.innerHTML = ''; 

    // Green
    for (let i = 0; i < result.bulls; i++) {
        let d = document.createElement("div"); d.className = "dot bull"; feedbackBox.appendChild(d);
    }
    // Yellow
    for (let i = 0; i < result.cows; i++) {
        let d = document.createElement("div"); d.className = "dot cow"; feedbackBox.appendChild(d);
    }
    // Gray
    let remaining = gameLength - result.bulls - result.cows;
    for (let i = 0; i < remaining; i++) {
        let d = document.createElement("div");
        d.className = "dot miss";
        feedbackBox.appendChild(d);
    }
}

function endGame(won, code) {
    gameOver = true;
    if (timerInterval) clearInterval(timerInterval);
    
    // A. Save Stats Logic
    updateStats(won, currentRow + 1);

    // B. Optional: Fire Confetti if won (Visual flair before redirect)
    if (won && typeof confetti === 'function') {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    }

    // C. THE REDIRECT
    setTimeout(() => {
        window.location.href = "/result";
    }, 1000);
}

// 6. UTILITIES (Timer, Hints, Stats)

function startTimer(seconds) {
    const display = document.getElementById('timer-display');
    if(!display) return;
    display.style.display = "inline"; 
    
    let timeLeft = seconds;
    timerInterval = setInterval(() => {
        if (gameOver) { clearInterval(timerInterval); return; }
        
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        display.innerText = `${mins < 10 ? '0'+mins : mins}:${secs < 10 ? '0'+secs : secs}`;
        
        if (timeLeft <= 10) display.style.color = "red";
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            display.innerText = "00:00";
            alert("⏰ TIME IS UP!");
            giveUp(); 
        }
        timeLeft--;
    }, 1000);
}

function getHint() {
    if (gameOver) return;
    if (!confirm("Use a HINT? (Max 2 per game)")) return;
    fetch('/api/hint', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
        if (data.number) alert(`💡 HINT: Position ${data.index + 1} is ${data.number}`);
        else alert(data.message);
    });
}

function giveUp() {
    if (gameOver) return;
    if (confirm("Are you sure you want to surrender?")) {
        fetch('/api/surrender', { method: 'POST' })
        .then(res => res.json())
        .then(data => endGame(false, data.secret_code));
    }
}

function generateShareGrid() {
    let text = `🕵️ CodeBreaker (${gameLength} Digits)\n`;
    const rows = document.querySelectorAll(".row");
    rows.forEach(row => {
        const feedback = row.querySelector(".feedback-box");
        if (feedback && feedback.children.length > 0) {
            let rowString = "";
            for (let dot of feedback.children) {
                if (dot.classList.contains("bull")) rowString += "🟢";
                else if (dot.classList.contains("cow")) rowString += "🟡";
                else rowString += "⚫";
            }
            if (rowString.length > 0) text += rowString + "\n";
        }
    });
    return text;
}

// 7. KEYBOARD SUPPORT (Physical Keys)
document.addEventListener("keydown", (e) => {
    if (gameOver) return;
    
    // Check if user is trying to refresh (Cmd+R or F5) - let them
    if (e.metaKey || e.ctrlKey) return;

    if (e.key === "Enter") {
        e.preventDefault();
        submitGuess();
    } else if (e.key === "Backspace") {
        deleteNumber();
    } else if (e.key >= "0" && e.key <= "9") {
        handleInput(e.key);
    }
});

// 8. STATS (LocalStorage)
const STORAGE_KEY = 'codebreaker_stats';
function getStats() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { played: 0, won: 0, streak: 0, maxStreak: 0, distribution: {} };
}
function updateStats(won, attempt) {
    let stats = getStats();
    stats.played++;
    if (won) {
        stats.won++;
        stats.streak++;
        if (stats.streak > stats.maxStreak) stats.maxStreak = stats.streak;
        stats.distribution[attempt] = (stats.distribution[attempt] || 0) + 1;
    } else {
        stats.streak = 0;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}
function showStats() {
    const stats = getStats();
    const modal = document.getElementById('statsModal');
    if(!modal) return;
    
    document.getElementById('stat-played').innerText = stats.played;
    document.getElementById('stat-winpct').innerText = stats.played > 0 ? Math.round((stats.won/stats.played)*100) : 0;
    document.getElementById('stat-streak').innerText = stats.streak;
    
    // Draw Bar Chart
    const distContainer = document.getElementById('guess-distribution');
    distContainer.innerHTML = '';
    const maxVal = Math.max(...Object.values(stats.distribution), 1);
    
    for (let i = 1; i <= maxTries; i++) {
        if (!stats.distribution[i] && i > 10) continue;
        const count = stats.distribution[i] || 0;
        const widthPct = (count / maxVal) * 100;
        const row = document.createElement('div');
        row.className = 'dist-row';
        row.innerHTML = `<div class="dist-label">${i}</div><div class="dist-bar-container"><div class="dist-bar ${count > 0 ? 'highlight' : ''}" style="width: ${Math.max(widthPct, 7)}%">${count}</div></div>`;
        distContainer.appendChild(row);
    }
    modal.classList.remove('hidden');
}
function closeStats() {
    document.getElementById('statsModal').classList.add('hidden');
}

// 9. HELP/RULES MODAL
window.toggleGameRules = function(show) {
    const modal = document.getElementById('gameRulesModal');
    if(!modal) return;
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
};