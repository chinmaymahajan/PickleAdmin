# CourtControl

Free, open-source session manager for pickleball and tennis. No server, no sign-up, no cost. Your data never leaves your device.

**[Launch App →](https://chinmaymahajan.github.io/PickleAdmin/)**

---

## Why CourtControl?

Running pickleball and tennis sessions means juggling player rotations, court assignments, timers, and fairness — all while people are waiting to play. CourtControl handles the logistics so you can focus on the games.

---

## Features

### Session Management
- Create, resume, and delete sessions
- Switch between sessions from the header bar
- Reset rounds while keeping your player and court roster
- Full session state persists across page refreshes — timer, active round, break state, everything
- Per-session cache survives switching between sessions

### Two Operating Modes

**Manual** — Generate rounds one at a time. Optional countdown timer with buzzer.

**Auto** — Set total rounds, round duration, and break time. The app generates all rounds upfront and auto-advances through them with configurable breaks.

### Player Management
- Add and remove players with inline inputs
- Import players from Excel (.xlsx) or CSV with auto-detection and preview
- Player Directory — every player you add is remembered across sessions. Next time, open the directory, search by name, and tap to add them back instantly. No retyping.
- Fair bye distribution tracks who sat out so everyone plays equally
- In auto mode, roster changes automatically regenerate future rounds
- Supports up to 100 players and 30 courts per session

### Drag-and-Drop Court Assignments
- Drag players between court slots to swap positions
- Drag bench players onto court slots to assign them
- Visual feedback with drag-over highlights and conflict detection
- Duplicate assignments are highlighted in red and block saving
- Works alongside typeahead search — use whichever is faster
- Touch-friendly for iPad and tablet use

### Smart Pairing
- Tracks partnership history across all rounds in a session
- When generating rounds, evaluates all possible team splits per court and picks the one with the fewest repeat partner pairings
- In long sessions where all pairings are exhausted, picks the least-repeated combinations
- Applies to both auto and manual round generation
- Preserves bye fairness

### TV Display
- Full-screen dark overlay for projectors and big screens
- Responsive layout scales from 1 court to 30 courts
- 4K-ready with dedicated scaling for ultra-wide displays
- Shows "Up Next" matchups during breaks
- Smooth round transition animations

### Timer & Sound
- Configurable round and break durations
- Visual countdown with amber warning and red pulse states
- Horn sound effect when a round ends
- Timer survives page refresh, league switching, and background tabs
- Hide/show toggle without interrupting the countdown

### Themes
- Two color themes switchable from the header:
  - **Classic** — clean indigo/slate palette
  - **Court Neon** — dark navy + lime accents with a modern sport aesthetic
- Both themes support light and dark mode
- Smooth page transitions between Setup and Rounds tabs
- Respects `prefers-reduced-motion` for accessibility

---

## Privacy

All data stays on your device. Nothing is transmitted to any server. You own your data completely.

---

## Getting Started

The app is deployed and ready to use:

**[https://chinmaymahajan.github.io/PickleAdmin/](https://chinmaymahajan.github.io/PickleAdmin/)**

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

## Tech Stack

- React 18, TypeScript, Vite
- Framer Motion
- Jest, React Testing Library, fast-check
- GitHub Pages
- Web Audio API
- Google Fonts: Fira Sans, Fira Code, Space Grotesk

## License

MIT
