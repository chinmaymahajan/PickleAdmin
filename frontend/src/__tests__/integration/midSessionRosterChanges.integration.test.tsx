import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '../../App';
import { api } from '../../api/client';
import { League, Player, Court, Round, Assignment, LeagueFormat } from '../../types';

jest.mock('../../api/client');
const mockedApi = api as jest.Mocked<typeof api>;

const league: League = {
  id: 'league-1',
  name: 'Test League',
  format: LeagueFormat.ROUND_ROBIN,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const players: Player[] = [
  { id: 'p1', leagueId: 'league-1', name: 'Alice', createdAt: new Date() },
  { id: 'p2', leagueId: 'league-1', name: 'Bob', createdAt: new Date() },
  { id: 'p3', leagueId: 'league-1', name: 'Charlie', createdAt: new Date() },
  { id: 'p4', leagueId: 'league-1', name: 'Diana', createdAt: new Date() },
];

const courts: Court[] = [
  { id: 'c1', leagueId: 'league-1', identifier: 'Court 1', createdAt: new Date() },
];

function makeRound(num: number): Round {
  return { id: `r${num}`, leagueId: 'league-1', roundNumber: num, createdAt: new Date() };
}

function makeAssignments(roundId: string, playerIds: string[] = ['p1', 'p2', 'p3', 'p4']): Assignment[] {
  return [{
    id: `a-${roundId}`,
    roundId,
    courtId: 'c1',
    team1PlayerIds: [playerIds[0], playerIds[1]],
    team2PlayerIds: [playerIds[2], playerIds[3]],
    createdAt: new Date(),
  }];
}

function setupLocalStorage(opts: {
  sessionMode?: string;
  breakMinutes?: number;
  totalRoundsPlanned?: number;
  roundDurationMinutes?: number;
} = {}) {
  const { breakMinutes = 2, totalRoundsPlanned = 3, roundDurationMinutes = 10, sessionMode } = opts;
  const storageMap: Record<string, string> = {
    breakMinutes: String(breakMinutes),
    totalRoundsPlanned: String(totalRoundsPlanned),
    roundDurationMinutes: String(roundDurationMinutes),
  };
  if (sessionMode) storageMap.sessionMode = sessionMode;
  Storage.prototype.getItem = jest.fn((key: string) => storageMap[key] ?? null);
  Storage.prototype.setItem = jest.fn();
}

/**
 * Helper: renders App, selects the league, lands on Setup tab in manual mode (default).
 */
async function renderInManualMode(initialRounds: Round[] = []) {
  setupLocalStorage({});

  mockedApi.listLeagues.mockResolvedValue([league]);
  mockedApi.selectLeague.mockResolvedValue(undefined);
  mockedApi.getPlayers.mockResolvedValue([...players]);
  mockedApi.getCourts.mockResolvedValue(courts);
  mockedApi.listRounds.mockResolvedValue(initialRounds);
  mockedApi.getByeCounts.mockResolvedValue({});

  if (initialRounds.length > 0) {
    mockedApi.getAssignments.mockImplementation(async (roundId: string) => {
      return makeAssignments(roundId);
    });
  }

  render(<App />);

  await waitFor(() => {
    expect(screen.getByText('Your Sessions')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByText('Resume'));

  await waitFor(() => {
    expect(screen.getByText('Test League')).toBeInTheDocument();
  });
}

/**
 * Helper: renders App in auto mode, generates rounds, and starts the session.
 */
async function renderInAutoMode(opts: { totalRounds?: number; breakMinutes?: number; roundDurationMinutes?: number } = {}) {
  const { totalRounds = 3, breakMinutes = 2, roundDurationMinutes = 10 } = opts;

  setupLocalStorage({ breakMinutes, totalRoundsPlanned: totalRounds, roundDurationMinutes });

  const allRounds: Round[] = [];
  for (let i = 1; i <= totalRounds; i++) allRounds.push(makeRound(i));

  let roundsGenerated = false;

  mockedApi.listLeagues.mockResolvedValue([league]);
  mockedApi.selectLeague.mockResolvedValue(undefined);
  mockedApi.getPlayers.mockResolvedValue([...players]);
  mockedApi.getCourts.mockResolvedValue(courts);
  mockedApi.getByeCounts.mockResolvedValue({});
  mockedApi.listRounds.mockImplementation(async () => roundsGenerated ? allRounds : []);

  let generateCallCount = 0;
  mockedApi.generateRound.mockImplementation(async () => {
    const round = allRounds[generateCallCount] || makeRound(generateCallCount + 1);
    generateCallCount++;
    if (generateCallCount >= totalRounds) roundsGenerated = true;
    return round;
  });

  mockedApi.getAssignments.mockImplementation(async (roundId: string) => makeAssignments(roundId));

  render(<App />);

  await waitFor(() => { expect(screen.getByText('Your Sessions')).toBeInTheDocument(); });
  fireEvent.click(screen.getByText('Resume'));
  await waitFor(() => { expect(screen.getByText('Test League')).toBeInTheDocument(); });

  // Wait for Setup tab to fully load
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Players' })).toBeInTheDocument();
  });

  // Switch to Auto mode
  fireEvent.click(screen.getByText('Auto'));
  await waitFor(() => { expect(screen.getByText('Break Between Rounds')).toBeInTheDocument(); });

  return { allRounds };
}

async function startAutoSession() {
  const startBtn = screen.getByText('Start Session →');
  await act(async () => { fireEvent.click(startBtn); });
  await waitFor(() => { expect(mockedApi.generateRound).toHaveBeenCalled(); });
}

async function navigateToSetupTab() {
  const setupTab = screen.getByRole('button', { name: 'Setup' });
  fireEvent.click(setupTab);
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Players' })).toBeInTheDocument();
  });
}

describe('Mid-Session Roster Changes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Auto Mode: Delete Player ───

  describe('Auto Mode - Delete player triggers regeneration', () => {
    it('should call regenerateFutureRounds when a player is deleted during an auto session', async () => {
      const { allRounds } = await renderInAutoMode({ totalRounds: 3, breakMinutes: 2, roundDurationMinutes: 10 });
      await startAutoSession();

      // Advance past initial break to activate Round 1
      await act(async () => { jest.advanceTimersByTime(2 * 60 * 1000 + 100); });

      await waitFor(() => {
        const timerLabel = document.querySelector('.timer-label');
        expect(timerLabel?.textContent).toBe('remaining');
      });

      await navigateToSetupTab();

      // Mock deletePlayer and regenerateFutureRounds
      mockedApi.deletePlayer.mockResolvedValue(undefined);
      mockedApi.regenerateFutureRounds.mockResolvedValue(allRounds);

      // Click the remove button for Alice using aria-label
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Remove Alice' }));
      });

      await waitFor(() => {
        expect(mockedApi.deletePlayer).toHaveBeenCalledWith('p1');
      });

      await waitFor(() => {
        expect(mockedApi.regenerateFutureRounds).toHaveBeenCalledWith('league-1', 1);
      });

      await waitFor(() => {
        expect(screen.getByText('Future rounds regenerated with updated roster')).toBeInTheDocument();
      });
    });
  });

  // ─── Manual Mode: Add Player then Generate Next Round ───

  describe('Manual Mode - Add player mid-session, generate next round uses updated roster', () => {
    it('should include the newly added player when generating the next round', async () => {
      await renderInManualMode();

      // Wait for Setup tab
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Players' })).toBeInTheDocument();
      });

      // Start session (manual mode) — go to Rounds tab
      const startBtn = screen.getByText('Start Session →');
      fireEvent.click(startBtn);

      await waitFor(() => {
        expect(screen.getByText(/START ROUND 1/)).toBeInTheDocument();
      });

      // Generate Round 1
      const round1 = makeRound(1);
      mockedApi.generateRound.mockResolvedValueOnce(round1);
      mockedApi.getAssignments.mockResolvedValue(makeAssignments('r1'));
      mockedApi.getByeCounts.mockResolvedValue({});

      await act(async () => {
        fireEvent.click(screen.getByText(/START ROUND 1/));
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();
      });

      // Switch to Setup tab to add a player
      await navigateToSetupTab();

      const newPlayer: Player = { id: 'p5', leagueId: 'league-1', name: 'Eve', createdAt: new Date() };
      mockedApi.addPlayer.mockResolvedValue(newPlayer);

      const playerInput = screen.getByPlaceholderText('Player name');
      fireEvent.change(playerInput, { target: { value: 'Eve' } });
      const addButtons = screen.getAllByText('Add');
      await act(async () => {
        fireEvent.click(addButtons[0]);
      });

      await waitFor(() => {
        expect(mockedApi.addPlayer).toHaveBeenCalledWith('league-1', 'Eve');
      });

      // In manual mode, regenerateFutureRounds should NOT be called
      expect(mockedApi.regenerateFutureRounds).not.toHaveBeenCalled();

      // Switch to Rounds tab and generate next round
      const roundsTab = screen.getAllByRole('button').find(
        btn => btn.textContent === 'Rounds' && btn.classList.contains('tab-btn')
      );
      fireEvent.click(roundsTab!);

      await waitFor(() => {
        expect(screen.getByText(/START ROUND 2/)).toBeInTheDocument();
      });

      // Mock Round 2 with the new player included in assignments
      const round2 = makeRound(2);
      const round2Assignments = makeAssignments('r2', ['p5', 'p2', 'p3', 'p4']);
      mockedApi.generateRound.mockResolvedValueOnce(round2);
      mockedApi.getAssignments.mockResolvedValue(round2Assignments);
      mockedApi.getByeCounts.mockResolvedValue({});

      await act(async () => {
        fireEvent.click(screen.getByText(/START ROUND 2/));
      });

      await waitFor(() => {
        expect(mockedApi.generateRound).toHaveBeenCalledTimes(2);
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Round 2' })).toBeInTheDocument();
      });

      // Verify the API was called to generate the round (the backend uses current roster)
      expect(mockedApi.generateRound).toHaveBeenLastCalledWith('league-1');
    });
  });

  // ─── Manual Mode: Delete Player then Generate Next Round ───

  describe('Manual Mode - Delete player mid-session, generate next round excludes them', () => {
    it('should exclude the deleted player when generating the next round', async () => {
      await renderInManualMode();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Players' })).toBeInTheDocument();
      });

      // Start session
      fireEvent.click(screen.getByText('Start Session →'));

      await waitFor(() => {
        expect(screen.getByText(/START ROUND 1/)).toBeInTheDocument();
      });

      // Generate Round 1
      const round1 = makeRound(1);
      mockedApi.generateRound.mockResolvedValueOnce(round1);
      mockedApi.getAssignments.mockResolvedValue(makeAssignments('r1'));
      mockedApi.getByeCounts.mockResolvedValue({});

      await act(async () => {
        fireEvent.click(screen.getByText(/START ROUND 1/));
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();
      });

      // Switch to Setup tab to remove a player
      await navigateToSetupTab();

      mockedApi.deletePlayer.mockResolvedValue(undefined);

      // Remove Alice
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Remove Alice' }));
      });

      await waitFor(() => {
        expect(mockedApi.deletePlayer).toHaveBeenCalledWith('p1');
      });

      // In manual mode, regenerateFutureRounds should NOT be called
      expect(mockedApi.regenerateFutureRounds).not.toHaveBeenCalled();

      // Switch to Rounds tab and generate next round
      const roundsTab = screen.getAllByRole('button').find(
        btn => btn.textContent === 'Rounds' && btn.classList.contains('tab-btn')
      );
      fireEvent.click(roundsTab!);

      await waitFor(() => {
        expect(screen.getByText(/START ROUND 2/)).toBeInTheDocument();
      });

      // Mock Round 2 — assignments should NOT include the deleted player (p1)
      const round2 = makeRound(2);
      const round2Assignments: Assignment[] = [{
        id: 'a-r2',
        roundId: 'r2',
        courtId: 'c1',
        team1PlayerIds: ['p2', 'p3'],
        team2PlayerIds: ['p4'],
        createdAt: new Date(),
      }];
      mockedApi.generateRound.mockResolvedValueOnce(round2);
      mockedApi.getAssignments.mockResolvedValue(round2Assignments);
      mockedApi.getByeCounts.mockResolvedValue({});

      await act(async () => {
        fireEvent.click(screen.getByText(/START ROUND 2/));
      });

      await waitFor(() => {
        expect(mockedApi.generateRound).toHaveBeenCalledTimes(2);
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Round 2' })).toBeInTheDocument();
      });

      // The generate call goes to the backend which uses the current roster (without p1)
      expect(mockedApi.generateRound).toHaveBeenLastCalledWith('league-1');
    });
  });

  // ─── End-to-End Manual Mode: Full flow with add + delete ───

  describe('Manual Mode E2E - generate rounds, add/delete player, generate next round, verify roster', () => {
    it('full flow: generate R1 → add player → generate R2 → delete player → generate R3', async () => {
      await renderInManualMode();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Players' })).toBeInTheDocument();
      });

      // Start session
      fireEvent.click(screen.getByText('Start Session →'));
      await waitFor(() => { expect(screen.getByText(/START ROUND 1/)).toBeInTheDocument(); });

      // ── Step 1: Generate Round 1 with original 4 players ──
      const round1 = makeRound(1);
      mockedApi.generateRound.mockResolvedValueOnce(round1);
      mockedApi.getAssignments.mockResolvedValue(makeAssignments('r1'));
      mockedApi.getByeCounts.mockResolvedValue({});

      await act(async () => {
        fireEvent.click(screen.getByText(/START ROUND 1/));
      });
      await waitFor(() => { expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument(); });

      // ── Step 2: Add a new player (Eve) ──
      await navigateToSetupTab();

      const newPlayer: Player = { id: 'p5', leagueId: 'league-1', name: 'Eve', createdAt: new Date() };
      mockedApi.addPlayer.mockResolvedValue(newPlayer);

      const playerInput = screen.getByPlaceholderText('Player name');
      fireEvent.change(playerInput, { target: { value: 'Eve' } });
      const addButtons = screen.getAllByText('Add');
      await act(async () => {
        fireEvent.click(addButtons[0]);
      });

      await waitFor(() => { expect(mockedApi.addPlayer).toHaveBeenCalledWith('league-1', 'Eve'); });

      // ── Step 3: Generate Round 2 — should use 5-player roster ──
      const roundsTab = screen.getAllByRole('button').find(
        btn => btn.textContent === 'Rounds' && btn.classList.contains('tab-btn')
      );
      fireEvent.click(roundsTab!);
      await waitFor(() => { expect(screen.getByText(/START ROUND 2/)).toBeInTheDocument(); });

      const round2 = makeRound(2);
      // Round 2 assignments include the new player p5
      const round2Assignments = makeAssignments('r2', ['p5', 'p2', 'p3', 'p4']);
      mockedApi.generateRound.mockResolvedValueOnce(round2);
      mockedApi.getAssignments.mockResolvedValue(round2Assignments);
      mockedApi.getByeCounts.mockResolvedValue({});

      await act(async () => {
        fireEvent.click(screen.getByText(/START ROUND 2/));
      });
      await waitFor(() => { expect(screen.getByRole('heading', { name: 'Round 2' })).toBeInTheDocument(); });
      expect(mockedApi.generateRound).toHaveBeenCalledTimes(2);

      // ── Step 4: Delete a player (Bob, p2) ──
      await navigateToSetupTab();

      mockedApi.deletePlayer.mockResolvedValue(undefined);

      // Remove Bob
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Remove Bob' }));
      });

      await waitFor(() => { expect(mockedApi.deletePlayer).toHaveBeenCalledWith('p2'); });

      // ── Step 5: Generate Round 3 — should use roster without Bob ──
      fireEvent.click(roundsTab!);
      await waitFor(() => { expect(screen.getByText(/START ROUND 3/)).toBeInTheDocument(); });

      const round3 = makeRound(3);
      // Round 3 assignments: p1, p5, p3, p4 (no p2)
      const round3Assignments = makeAssignments('r3', ['p1', 'p5', 'p3', 'p4']);
      mockedApi.generateRound.mockResolvedValueOnce(round3);
      mockedApi.getAssignments.mockResolvedValue(round3Assignments);
      mockedApi.getByeCounts.mockResolvedValue({});

      await act(async () => {
        fireEvent.click(screen.getByText(/START ROUND 3/));
      });
      await waitFor(() => { expect(screen.getByRole('heading', { name: 'Round 3' })).toBeInTheDocument(); });
      expect(mockedApi.generateRound).toHaveBeenCalledTimes(3);

      // All 3 rounds generated successfully with roster changes between them
      // Manual mode never calls regenerateFutureRounds — it relies on next generateRound
      expect(mockedApi.regenerateFutureRounds).not.toHaveBeenCalled();
    });
  });
});
