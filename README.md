# Pickle Admin

Free, open-source pickleball session manager. Runs entirely in the browser — no server, no sign-up, no cost. Just open the app and start organizing games.

**[Launch App →](https://chinmaymahajan.github.io/PickleAdmin/)**

---

## What It Does

Pickle Admin handles the tedious parts of running pickleball sessions: assigning players to courts, rotating teams fairly, managing timers, and displaying matchups on a big screen. You bring the players — it handles the rest.

## Features

### Session Management
- Create, resume, and delete sessions
- Switch between sessions from the header bar
- Reset rounds while keeping your player and court roster
- Full session state persists across page refreshes

### Two Modes

**Manual** — Generate rounds one at a time. Optional countdown timer.

**Auto** — Set total rounds, round duration, and break time. The app generates all rounds upfront and auto-advances through them.

### Players & Courts
- Add/remove with inline inputs (type + Enter)
- Import players from Excel or CSV with auto-detection and preview
- Fair bye distribution — tracks who sat out so everyone plays equally
- In auto mode, roster changes automatically regenerate future rounds

### TV Display
- Full-screen dark overlay for projectors and big screens
- Responsive layout scales from 1 court to 30 courts
- 4K-ready with dedicated scaling for 2560px+ displays
- Shows "Up Next" matchups during breaks
- Smooth round transition animations

### Timer & Sound
- Configurable round and break durations
- Visual countdown: normal → amber warning → red pulse → expired
- Train horn sound effect (5 seconds) when a round ends
- Hide/show toggle without stopping the timer

### Other
- Dark mode (persisted)
- Dev tools: seed 26 players + 6 courts for quick testing
- Limits: 100 players, 30 courts, 10 sessions

---

## Getting Started

The app is deployed and ready to use:

**[[https://chinmaymahajan.github.io/PickleballHq](https://chinmaymahajan.github.io/PickleAdmin/)/]**

All data is stored in your browser's localStorage. Nothing leaves your device.

### Run Locally

```bash
cd frontend
npm install
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

### Build

```bash
cd frontend
npm run build
```

Output goes to `frontend/dist/`.

### Tests

```bash
cd frontend
npm test
```

---

## Project Structure

```
pickle-admin/
├── frontend/              # React SPA (the deployed app)
│   └── src/
│       ├── api/           # localStorage-backed data layer
│       ├── components/    # UI components
│       ├── types/         # TypeScript interfaces
│       └── utils/         # Sound effects, helpers
├── backend/               # Express API (reference implementation, not deployed)
│   └── src/
│       ├── services/      # Business logic (round generation, bye fairness)
│       ├── data/          # In-memory data store
│       ├── routes/        # REST endpoints
│       └── models/        # Data models
└── .github/workflows/     # GitHub Pages deployment
```

The backend folder contains the original Express API with the same business logic. It's kept as a reference but is not required — the frontend includes a complete localStorage-backed implementation of all the same algorithms.

## Tech Stack

- React 18, TypeScript, Vite
- Jest + React Testing Library
- GitHub Pages (static deployment)
- Web Audio API (timer sound effects)

## License

MIT
