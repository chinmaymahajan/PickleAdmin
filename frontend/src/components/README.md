# React UI Components

This directory contains the React UI components for the CourtControl application.

## Components

### LeagueSelector
Displays a list of leagues and allows administrators to select the active league.

**Props:**
- `leagues: League[]` - Array of available leagues
- `selectedLeagueId: string | null` - ID of the currently selected league
- `onSelect: (leagueId: string) => void` - Callback when a league is selected

**Requirements:** 3.1, 3.3

### PlayerManager
Displays the list of players and provides a form to add new players with validation.

**Props:**
- `leagueId: string` - ID of the current league
- `players: Player[]` - Array of players in the league
- `onAddPlayer: (name: string) => Promise<void>` - Async callback to add a player

**Requirements:** 1.1, 1.3, 1.4

### CourtManager
Displays the list of courts and provides a form to add new courts with validation.

**Props:**
- `leagueId: string` - ID of the current league
- `courts: Court[]` - Array of courts in the league
- `onAddCourt: (identifier: string) => Promise<void>` - Async callback to add a court

**Requirements:** 2.1, 2.3, 2.4

### RoundDisplay
Displays court assignments for a specific round, organized by court identifier.

**Props:**
- `round: Round | null` - The round to display
- `assignments: Assignment[]` - Array of assignments for the round
- `courts: Court[]` - Array of all courts (for looking up court names)
- `players: Player[]` - Array of all players (for looking up player names)

**Requirements:** 4.3, 5.1, 5.2, 5.3, 5.4, 7.3

### RoundNavigator
Provides navigation controls for viewing different rounds.

**Props:**
- `currentRound: number` - The current round number being viewed
- `totalRounds: number` - Total number of rounds available
- `onNavigate: (roundNumber: number) => void` - Callback when navigating to a round

**Requirements:** 7.1, 7.3

### RoundGenerator
Provides a button to generate a new round with automatic player assignments.

**Props:**
- `leagueId: string` - ID of the current league
- `onGenerateRound: () => Promise<void>` - Async callback to generate a new round

**Requirements:** 4.1, 6.1

## Usage Example

```tsx
import {
  LeagueSelector,
  PlayerManager,
  CourtManager,
  RoundDisplay,
  RoundNavigator,
  RoundGenerator
} from './components';

function App() {
  // ... state management ...

  return (
    <div>
      <LeagueSelector
        leagues={leagues}
        selectedLeagueId={selectedLeagueId}
        onSelect={handleSelectLeague}
      />
      
      <PlayerManager
        leagueId={selectedLeagueId}
        players={players}
        onAddPlayer={handleAddPlayer}
      />
      
      <CourtManager
        leagueId={selectedLeagueId}
        courts={courts}
        onAddCourt={handleAddCourt}
      />
      
      <RoundGenerator
        leagueId={selectedLeagueId}
        onGenerateRound={handleGenerateRound}
      />
      
      <RoundNavigator
        currentRound={currentRound}
        totalRounds={totalRounds}
        onNavigate={handleNavigateToRound}
      />
      
      <RoundDisplay
        round={currentRound}
        assignments={assignments}
        courts={courts}
        players={players}
      />
    </div>
  );
}
```

## Testing

Component tests are located in `__tests__/` subdirectory. Run tests with:

```bash
npm test
```
