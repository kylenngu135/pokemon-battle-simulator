# Pokemon Battle Simulator

A real-time, two-player Pokemon battle simulator with a team builder, turn-based combat engine, and battle history persistence. Players build custom teams from any Pokemon, pick their moves, share a lobby code with an opponent, and battle it out in a Gen 1-style format.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Battle Engine](#battle-engine)
- [API Reference](#api-reference)
- [Socket Events](#socket-events)
- [Getting Started](#getting-started)
- [Running Tests](#running-tests)

---

## Features

- **Team Builder** — Search and select up to 6 Pokemon, pick 1–4 moves per Pokemon from their full learnable moveset
- **Lobby System** — Player 1 creates a lobby and receives a shareable match ID; Player 2 joins via that code
- **Real-time Battles** — Both players connect over WebSocket (Socket.IO); turns resolve simultaneously when both submit actions
- **Full Move Coverage** — Damage, status ailments, multi-hit, two-turn charging, recharge, rampage locks, healing, trapping, OHKO, weather, field effects, and many unique moves (Mimic, Metronome, Transform, Counter, Bide, Rage, etc.)
- **Status Effects** — Burn, poison, toxic (escalating), paralysis, sleep, freeze, confusion, flinch, disable, leech seed, substitute, protect, reflect, light screen, mist
- **Weather System** — Sun, rain, sandstorm, and hail with turn duration, damage/boost modifiers, and weather-dependent healing (Morning Sun, Synthesis, etc.)
- **Faint-Switch Flow** — When a Pokemon faints mid-turn, the owning player is prompted to send in a replacement before the next turn begins
- **Battle Persistence** — Completed battles (result, player names, winner, total turns, per-turn logs) are saved to a SQLite database
- **Battle History API** — Retrieve past battle results and per-turn logs
- **Damage Formula** — Gen 1-style formula with STAB, type effectiveness, critical hits (6.25%), random roll, burn modifier, Reflect/Light Screen halving, stat stage multipliers, and weather modifiers

---

## Architecture

```
pokemon-battle-simulator/
├── src/                  # Express/Socket.IO backend (TypeScript)
└── client/               # Next.js frontend (TypeScript + Tailwind CSS)
```

### Backend

- **Express 5** serves the REST API and the OpenAPI spec at `/openapi.json`
- **Socket.IO** handles real-time battle communication
- **better-sqlite3** persists battle results and turn logs to `data/battles.db`
- **PokéAPI** data is pre-fetched and stored in JSON caches (`src/data/`) so the server never hits the API at runtime

### Frontend

- **Next.js** (App Router) with React 19
- **Tailwind CSS v4** for styling
- **Socket.IO client** for WebSocket connection to the battle server
- **Axios** for REST calls (team builder, Pokemon lookup)

### State Machine

Battle state flows through a formal state machine:

```
waiting → active → resolving (transient) → active
                              └→ switching → active
                              └→ finished
```

Every player action dispatches an event through `battleStateMachine.transition()`, which validates the transition and delegates to `battleReducer`. The reducer returns a new immutable state plus a list of side effects (socket emits, DB writes, etc.) that the socket handler applies. No state is mutated in place — the reducer works on a deep copy each time.

---

## Project Structure

### Backend (`src/`)

```
src/
├── app.ts                        # Express app setup (CORS, JSON, routes, error handling)
├── index.ts                      # Server entry point, Socket.IO init
├── battle-engine/
│   ├── battleStateMachine.ts     # Valid transition table and dispatch guard
│   ├── battleReducer.ts          # Pure reducer — all turn resolution logic
│   ├── movePipeline.ts           # executeMoveEffect: per-move dispatch (unique + category)
│   ├── pipelineHandlers.ts       # Shared move effect handlers (damage, drain, recoil, etc.)
│   ├── effectsEngine.ts          # Status checks (paralysis, sleep, freeze, confusion, EOT)
│   └── lockManager.ts            # Multi-turn lock system (charging, recharge, rampage, rollout)
├── cache/
│   ├── pokemonCache.ts           # In-memory Map of Pokemon data loaded from JSON
│   └── moveCache.ts              # In-memory Map of move data loaded from JSON
├── controllers/
│   ├── battles.ts                # HTTP handlers for battle CRUD
│   ├── pokemon.ts                # HTTP handlers for Pokemon lookup
│   └── moves.ts                  # HTTP handlers for move lookup
├── db/
│   ├── database.ts               # SQLite init (better-sqlite3)
│   └── battle.repository.ts      # saveBattle, getBattle, getBattleTurns
├── models/
│   ├── battle.models.ts          # BattleState, BattlePokemon, BattleEvent, SideEffect types
│   ├── move.models.ts            # MoveResponse type (PokéAPI shape)
│   ├── pokemon.models.ts         # PokemonResponse type
│   └── shared.models.ts          # Shared types
├── routes/v1/
│   ├── battles.ts                # /api/v1/battles routes
│   ├── pokemon.ts                # /api/v1/pokemon routes
│   └── moves.ts                  # /api/v1/moves routes
├── sockets/
│   ├── battle.socket.ts          # Socket.IO event handlers (join, action, forfeit, disconnect)
│   └── battle.middleware.ts      # Socket validation middleware
├── store/
│   └── activeBattles.ts          # In-memory Map<matchId, BattleState> for live battles
├── utils/
│   ├── battle.utils.ts           # checkBattleOver, needsSwitch, getActivePokemon, applyStatChanges
│   ├── damage.utils.ts           # calculateDamage, checkAccuracy
│   └── turn.utils.ts             # determineTurnOrder, resolveSwitchAction
└── data/
    ├── typeChart.ts              # Full type effectiveness chart
    ├── statStages.ts             # Stat stage multiplier table
    └── sharedLink.ts             # Shared lobby link helpers
```

### Frontend (`client/src/`)

```
src/
├── app/
│   ├── page.tsx                  # Home screen (Create Lobby / Join Lobby)
│   ├── team-builder/page.tsx     # Team builder + lobby creation flow
│   ├── battle/page.tsx           # Battle screen entry
│   └── lobby/join/page.tsx       # Join lobby by match ID
├── components/
│   ├── battle/
│   │   ├── BattleScreen.tsx      # Main battle UI orchestrator
│   │   ├── ActionMenu.tsx        # Attack / Switch action selection
│   │   ├── MoveMenu.tsx          # Move picker with PP display
│   │   ├── BattleLog.tsx         # Scrollable turn-by-turn log
│   │   ├── HPBar.tsx             # Animated HP bar
│   │   ├── PartyIndicator.tsx    # Party health dots
│   │   ├── PokemonSprite.tsx     # Pokemon sprite display
│   │   └── StatsPanel.tsx        # Live stats panel
│   └── team-builder/
│       ├── PokemonSearch.tsx     # Name/ID search with autocomplete
│       ├── PokemonCard.tsx       # Selected Pokemon card with move picker
│       └── MoveSelector.tsx      # Move search and selection
├── hooks/
│   ├── useBattle.ts              # Battle state + Socket.IO event handling
│   ├── usePokemon.ts             # Pokemon data fetching
│   └── useTurnPlayback.ts        # Sequential turn event animation
├── lib/
│   ├── api.ts                    # Axios API client
│   └── socket.ts                 # Socket.IO singleton
└── types/
    ├── battle.types.ts           # Frontend battle type mirrors
    └── pokemon.types.ts          # Frontend Pokemon/move types
```

---

## Battle Engine

### Turn Resolution

When both players submit an action, the reducer resolves the turn in this order:

1. Determine turn order by move priority then Speed stat (with paralysis speed halving)
2. For each action in order:
   - Skip if the acting Pokemon already fainted
   - Run pre-move status checks: recharge, paralysis, sleep, freeze, confusion, flinch, disable
   - Thaw defender if hit by a Fire-type move while frozen
   - Execute the move via `executeMoveEffect`
   - Sync multi-turn lock state (charging, recharge, rampage, rollout, Fury Cutter)
   - Check if battle is over after each action
3. Apply end-of-turn effects: weather damage, leech seed drain, burn/poison/toxic damage, ingrain heal, aqua ring heal, wish resolution
4. Decrement counters: disable, protect, reflect, light screen, mist, weather turns
5. Emit `battle:turnResult` with the full turn log, structured turn events, and updated player states

### Move Pipeline

`executeMoveEffect` in `movePipeline.ts` is the single entry point for all move effects. Dispatch order:

1. Reset Fury Cutter chain if a different move is used
2. Decrement PP / fall back to Struggle if all PP are gone
3. Handle two-turn charging moves (Solar Beam skips charge in sun)
4. Unique move handlers matched by move ID (Bide, Rest, Dream Eater, Substitute, Disable, Mimic, Metronome, Counter, Transform, Conversion, OHKO moves, trapping moves, Rollout, Fury Cutter, healing moves, etc.)
5. Weather move handlers
6. Category-based dispatch: `damage`, `ailment`, `damage+ailment`, `damage+lower`, `damage+raise`, `damage+heal`, `heal`, `net-good-stats`, `field-effect`, `swagger`, `damage+recharge`, `ohko`, `force-switch`, `unique`

### Damage Calculation

```
damage = floor(
  baseDamage(level=50, power, atkStat, defStat)
  × STAB (1.5 if same type)
  × typeEffectiveness
  × weatherMod
  × reflectMod / lightScreenMod
  × critMod (1.5 at 6.25%)
  × randomRoll (0.85–1.00)
)
```

Burn halves physical Attack. Stat stages use the standard multiplier table (±1 = ×1.5 / ×0.67, etc.).

### Multi-turn Lock System

`lockManager.ts` tracks moves that lock the user in for multiple turns:
- **Charging** (two-turn moves): Fly, Dig, Dive, Phantom Force, Solar Beam, etc.
- **Recharge**: Hyper Beam and similar moves (must skip next turn)
- **Rampage**: Outrage, Petal Dance, Thrash (2–3 turns, then confusion)
- **Rollout / Ice Ball**: Power doubles each turn, Defense Curl doubles base power
- **Fury Cutter**: Power doubles with consecutive hits, resets on miss

### State Machine Events

| Event | Valid in states |
|---|---|
| `PLAYER_JOINED` | `waiting`, `active` |
| `ACTION_SUBMITTED` | `active` |
| `SWITCH_SUBMITTED` | `switching` |
| `FORFEIT` | `active`, `switching` |
| `PLAYER_DISCONNECTED` | `active`, `switching` |

---

## API Reference

Base path: `/api/v1`

### Pokemon

| Method | Path | Description |
|---|---|---|
| `GET` | `/pokemon` | List all cached Pokemon |
| `GET` | `/pokemon/:id` | Get Pokemon by ID |

### Moves

| Method | Path | Description |
|---|---|---|
| `GET` | `/moves/:id` | Get move data by ID |

### Battles

| Method | Path | Description |
|---|---|---|
| `POST` | `/battles/start` | Create a new battle lobby |
| `POST` | `/battles/:battleId/join` | Join an existing battle (HTTP path — socket join is the primary flow) |
| `POST` | `/battles/:battleId/action` | Submit a battle action (HTTP fallback) |
| `POST` | `/battles/:battleId/forfeit` | Forfeit a battle |
| `GET` | `/battles` | List all completed battles |
| `GET` | `/battles/:battleId` | Get a specific battle's result |
| `GET` | `/battles/:battleId/turns` | Get per-turn logs for a battle |

#### Start Battle Request Body

```json
{
  "player1": {
    "name": "Ash",
    "team": [
      { "pokemonId": 25, "moves": [85, 87, 97, 113] }
    ]
  },
  "player2": {
    "name": "Misty",
    "team": [
      { "pokemonId": 7, "moves": [55, 127, 182, 240] }
    ]
  }
}
```

Returns `{ matchId: string }`.

---

## Socket Events

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `battle:join` | `{ battleId, player }` | Join a battle room |
| `battle:action` | `{ battleId, player, action }` | Submit turn action or faint-switch |
| `battle:forfeit` | `{ battleId, player }` | Forfeit the battle |

**Action shapes:**
```ts
// Attack
{ type: 'attack', moveId: number }

// Switch (voluntary or forced after faint)
{ type: 'switch', switchToIndex: number }
```

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `battle:ready` | `BattleReadyPayload` | Both players joined; battle begins |
| `battle:turnResult` | `TurnResultPayload` | Turn resolved; includes log, events, updated state |
| `battle:switchRequired` | `{ player }` | This player must send in a replacement |
| `battle:waitingForOpponentSwitch` | `{}` | Waiting for opponent to finish switching |
| `battle:over` | `{ winner, forfeited?, forfeitedBy? }` | Battle ended |
| `battle:opponentDisconnected` | `{ disconnectedPlayer }` | Opponent disconnected |
| `battle:error` | `{ message }` | Error from the server |

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install dependencies

```bash
# Backend
npm install

# Frontend
npm install --prefix client
```

### Environment

The backend reads from `.env` in the project root:

```env
PORT=3000
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

The frontend reads from `client/.env.local`. By default it connects to `http://localhost:3000`.

### Run in development

```bash
# Run both backend and frontend together
npm run dev:all

# Or separately:
npm run dev          # backend on :3000
npm run dev --prefix client  # frontend on :3001
```

Open `http://localhost:3001` in two browser windows to play against yourself.

### Build for production

```bash
# Backend
npm run build
npm start

# Frontend
npm run build --prefix client
npm start --prefix client
```

---

## Running Tests

The test suite uses Jest with `ts-jest`. Tests run against an in-memory SQLite database.

```bash
# Run all tests (sequentially)
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Test structure

```
src/__tests__/
├── unit/
│   ├── battle.utils.test.ts      # checkBattleOver, needsSwitch
│   ├── damage.utils.test.ts      # calculateDamage, type effectiveness, crits
│   ├── effectsEngine.test.ts     # Status effect checks
│   ├── healingMoves.test.ts      # Recover, Rest, Wish, etc.
│   ├── lockManager.test.ts       # Multi-turn lock system
│   ├── movePipeline.test.ts      # executeMoveEffect for all move categories
│   ├── statStages.test.ts        # Stat stage multiplier table
│   └── typeChart.test.ts         # Type effectiveness chart
└── integration/
    ├── battle.rest.test.ts        # REST API: start, join, action, forfeit, history
    └── battle.socket.test.ts      # Full socket-driven battle flows
```

### Linting

```bash
npm run lint        # backend
npm run lint:all    # backend + frontend
```
