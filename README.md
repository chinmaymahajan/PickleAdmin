# DinkTank

A web app for running pickleball sessions — round robin, open play, ladders. Handles player assignments, court management, and round progression so you can focus on playing.

## Features

### Session Management
- Create and resume sessions with named formats (Round Robin)
- Landing page shows existing sessions with quick resume, or a clean welcome screen for new users
- Session status indicator on the Setup page when an auto session is active (shows current round, time remaining, break status)
- Delete sessions with full cascade (removes all players, courts, rounds, and assignments)
- Switch sessions from the context bar by clicking the session name
- "New Session" button to reset rounds and timer while keeping players and courts
- Session state persists across page refreshes in auto mode (active round, timer, break status)

### Two Modes

**Manual Mode** — You control the pace. Generate rounds one at a time, optionally with a countdown timer.

**Auto Mode** — Set the number of rounds, round duration, and break time. DinkTank generates all rounds upfront and auto-advances through them with timers and breaks.

- Switching between modes prompts a confirmation and resets rounds while preserving players and courts

### Player & Court Setup
- Add/remove players and courts with inline inputs (type + Enter)
- Import players from Excel/CSV files with column auto-detection and preview modal
- Tab key navigates from the player input directly to the court input
- Typeahead autocomplete for editing player assignments on any court
- Inline conflict warnings when a player is assigned to multiple courts
- Fair bye distribution — tracks bye counts across all rounds so everyone sits out equally
- In auto mode, adding/removing players or courts automatically regenerates future rounds

### Round Management
- Round-by-round navigation with clickable tabs
- In auto mode, tabs show a live indicator (pulsing dot) for the active round while still letting admins browse and edit future rounds
- Assignments are editable via typeahead inputs with save/discard controls
- "Next In Line" section shows waiting players with bye counts

### TV Display Mode
- Full-screen dark overlay optimized for big screens and projectors
- Large court numbers as card headings with team matchups below (e.g., "Alice + Bob VS Carol + Dave")
- League name and round number centered at the top
- Responsive density scaling:
  - 1–4 courts: full-size layout
  - 5–6 courts: compact layout with scaled fonts
  - 7+ courts: dense layout with 4-column grid
- Viewport-relative font sizing (`clamp()`) scales naturally from laptops to 4K TVs
- Dedicated large-screen media query for 2560px+ displays
- Smooth fade-and-scale animation when a new round starts
- Timer overlay — countdown during rounds, break timer between rounds
- During breaks, shows "Up Next" with the next round's assignments
- Exit via Escape key, clicking the overlay background, or the ✕ button

### Timer System
- Optional in manual mode, required in auto mode
- Configurable round duration and break duration
- Visual states: normal → amber warning (under 60s) → red pulse (expired)
- "Time's Up" indicator on the last round only
- Train horn sound effect plays for 5 seconds when a round timer expires
- Hide/show toggle — admin can hide the timer without stopping it, and bring it back anytime
- Timer automatically unhides when a new round starts

### Settings
- Dark mode toggle (persisted)
- Round duration, break duration, total rounds (all persisted to localStorage)
- Session validation — requires 4+ players and 1+ court before starting

### Dev Tools
- Seed mock data (26 players, 6 courts)
- Clear all data

## Project Structure

```
dinktank/
├── backend/           # Node.js/Express API
│   └── src/
│       ├── data/      # In-memory data store
│       ├── middleware/ # Error handling
│       ├── models/    # TypeScript data models
│       ├── routes/    # REST endpoints
│       ├── services/  # Business logic
│       └── utils/     # Shuffle, validation
├── frontend/          # React SPA
│   └── src/
│       ├── api/       # API client
│       ├── components/# UI components
│       └── types/     # TypeScript interfaces
└── package.json       # Root workspace config
```

## Setup

```bash
npm install
npm run install:all
```

## Development

```bash
npm run dev:backend    # Express API on :3001
npm run dev:frontend   # Vite dev server on :5173
```

## Testing

```bash
npm test               # All tests
npm run test:backend   # Backend only
npm run test:frontend  # Frontend only
```

## Build

```bash
npm run build
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Node.js, Express, TypeScript
- **Testing**: Jest, React Testing Library
- **Package Management**: npm workspaces
