<div align="center">
  <h1>Codebreaker</h1>
  <p><strong>A modern, tactical-themed "Cows & Bulls" challenge.</strong> Decipher the sequence, outsmart the system, and prove your tactical superiority.</p>

  <!-- Screenshots Placeholder - under the title as requested -->
  <div style="display: flex; flex-direction: column; gap: 20px; align-items: center; margin-top: 20px;">
    <!-- [Screenshot 1: Landing Page] -->
    <div style="width: 100%; max-width: 800px; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); background: #1a1a1a; padding: 40px; text-align: center; border: 1px solid #333;">
      <p style="color: #666; font-family: monospace;">[ LANDING PAGE SCREENSHOT HERE ]</p>
    </div>

    <div style="display: flex; gap: 20px; width: 100%; max-width: 800px; justify-content: space-between;">
      <!-- [Screenshot 2: Single Player] -->
      <div style="flex: 1; border-radius: 12px; height: 180px; background: #1a1a1a; border: 1px solid #333; display: flex; align-items: center; justify-content: center;">
        <p style="color: #666; font-family: monospace;">[ GAMEPLAY VIEW ]</p>
      </div>
      <!-- [Screenshot 3: Multiplayer] -->
      <div style="flex: 1; border-radius: 12px; height: 180px; background: #1a1a1a; border: 1px solid #333; display: flex; align-items: center; justify-content: center;">
        <p style="color: #666; font-family: monospace;">[ MULTIPLAYER LOBBY ]</p>
      </div>
    </div>
  </div>

  <br />

  <div style="display: flex; gap: 10px; justify-content: center; margin-top: 10px;">
    <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js" />
    <img src="https://img.shields.io/badge/FastAPI-0.135-009688?style=flat-square&logo=fastapi" alt="FastAPI" />
    <img src="https://img.shields.io/badge/Socket.io-4.8-010101?style=flat-square&logo=socket.io" alt="Socket.io" />
    <img src="https://img.shields.io/badge/Redis-Red?style=flat-square&logo=redis" alt="Redis" />
    <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License" />
  </div>
</div>

<hr style="border: 0; border-top: 1px solid #333; margin: 40px 0;" />

## 🔍 Overview

Codebreaker is a high-performance, real-time strategy game inspired by the classic **Mastermind (Cools & Bulls)**. Built with a "Commando/Tactical" aesthetic, it offers both a challenging single-player campaign and a high-stakes multiplayer mode.

Integrated with **FastAPI** on the backend and **Next.js 16** on the frontend, the game leverages **WebSockets** for instantaneous feedback and a seamless user experience.

<hr style="border: 0; border-top: 1px dashed #444; margin: 30px 0;" />

## 🛠️ Tech Stack

<table width="100%">
  <tr>
    <td width="50%" valign="top">
      <h3>Frontend</h3>
      <ul>
        <li><strong>React 19 & Next.js 16</strong> (App Router)</li>
        <li><strong>Tailwind CSS 4</strong> (Styling)</li>
        <li><strong>Framer Motion</strong> (Animations)</li>
        <li><strong>Zustand</strong> (State Management)</li>
        <li><strong>Socket.io-client</strong> (Real-time)</li>
        <li><strong>Lucide React</strong> (Icons)</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3>Backend</h3>
      <ul>
        <li><strong>FastAPI</strong> (Asynchronous Framework)</li>
        <li><strong>Python Socket.IO</strong> (Bi-directional comms)</li>
        <li><strong>Redis</strong> (Session & State storage)</li>
        <li><strong>Pydantic v2</strong> (Validation)</li>
        <li><strong>Slowapi</strong> (Rate Limiting)</li>
        <li><strong>Uvicorn</strong> (ASGI Server)</li>
      </ul>
    </td>
  </tr>
</table>

<hr style="border: 0; border-top: 1px dashed #444; margin: 30px 0;" />

## 🚀 Key Features

- **🎮 Single Player Missions:** Progress through increasingly difficult levels with varied code lengths and attempts.
- **⚔️ Multiplayer Combat:** Real-time matches against other players using the custom Socket.io server.
- **✨ Premium UI/UX:** Smooth transitions, micro-animations, and a tactical theme designed to impress.
- **📊 Real-time Feedback:** Instantly see your "Hits" and "Clues" with animated grid updates.
- **🛡️ Robust Backend:** Scalable FastAPI architecture with centralized game logic and rate limiting.

<hr style="border: 0; border-top: 1px solid #333; margin: 40px 0;" />

## ⚙️ Getting Started

### Prerequisites

- **Node.js** (v20 or higher)
- **Python** (v3.11 or higher)
- **Redis Server** (required for multiplayer)
- **pnpm** (recommended for frontend)

### 1. Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### 2. Frontend Setup

```bash
cd frontend
pnpm install
pnpm dev
```

### 3. Environment Variables

Create detailed `.env` files in both directories based on the `.env.example` templates (if available). Ensure the frontend is pointing to the correct backend WebSocket URL.

<hr style="border: 0; border-top: 1px solid #333; margin: 40px 0;" />

<div align="center">
  <p><em>Crafted with precision for the mission-critical gamer.</em></p>
  <p>© 2026 Codebreaker Team</p>
</div>
