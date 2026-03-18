import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../App';
import { api } from '../../api/client';
import { League, Player, Court, Round, Assignment, LeagueFormat } from '../../types';

// Mock the api client module
jest.mock('../../api/client');
const mockedApi = api as jest.Mocked<typeof api>;

// Suppress localStorage warnings in test environment
beforeAll(() => {
  Storage.prototype.getItem = jest.fn(() => null);
  Storage.prototype.setItem = jest.fn();
});

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

const round1: Round = { id: 'r1', leagueId: 'league-1', roundNumber: 1, createdAt: new Date() };
const round2: Round = { id: 'r2', leagueId: 'league-1', roundNumber: 2, createdAt: new Date() };
const round3: Round = { id: 'r3', leagueId: 'league-1', roundNumber: 3, createdAt: new Date() };

const assignmentsR1: Assignment[] = [
  {
    id: 'a1',
    roundId: 'r1',
    courtId: 'c1',
    team1PlayerIds: ['p1', 'p2'],
    team2PlayerIds: ['p3', 'p4'],
    createdAt: new Date(),
  },
];

const assignmentsR2: Assignment[] = [
  {
    id: 'a2',
    roundId: 'r2',
    courtId: 'c1',
    team1PlayerIds: ['p1', 'p3'],
    team2PlayerIds: ['p2', 'p4'],
    createdAt: new Date(),
  },
];

const assignmentsR3: Assignment[] = [
  {
    id: 'a3',
    roundId: 'r3',
    courtId: 'c1',
    team1PlayerIds: ['p1', 'p4'],
    team2PlayerIds: ['p2', 'p3'],
    createdAt: new Date(),
  },
];

/**
 * Helper: renders App, selects the pre-existing league, and lands on the Setup tab.
 * Optionally accepts initial rounds to simulate a league that already has rounds.
 */
async function renderWithSelectedLeague(
  initialPlayers: Player[] = players,
  initialCourts: Court[] = courts,
  initialRounds: Round[] = [],
) {
  mockedApi.listLeagues.mockResolvedValue([league]);
  mockedApi.selectLeague.mockResolvedValue(undefined);
  mockedApi.getPlayers.mockResolvedValue(initialPlayers);
  mockedApi.getCourts.mockResolvedValue(initialCourts);
  mockedApi.listRounds.mockResolvedValue(initialRounds);
  mockedApi.getByeCounts.mockResolvedValue({});

  // If there are rounds, mock assignments for the last round (currentRound)
  if (initialRounds.length > 0) {
    const lastRound = initialRounds[initialRounds.length - 1];
    if (lastRound.id === 'r1') {
      mockedApi.getAssignments.mockResolvedValue(assignmentsR1);
    } else if (lastRound.id === 'r2') {
      mockedApi.getAssignments.mockResolvedValue(assignmentsR2);
    } else if (lastRound.id === 'r3') {
      mockedApi.getAssignments.mockResolvedValue(assignmentsR3);
    }
  }

  render(<App />);

  // Wait for sessions list
  await waitFor(() => {
    expect(screen.getByText('Your Sessions')).toBeInTheDocument();
  });

  // Click Resume to select the league
  fireEvent.click(screen.getByText('Resume'));

  // Wait for context bar to appear with league name
  await waitFor(() => {
    expect(screen.getByText('Test League')).toBeInTheDocument();
  });
}

describe('Round Generation & Display Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // F10.1: Generate round — Rounds tab shown, round with court assignments displayed
  // Validates: Requirements 10.1
  it('F10.1 - generating a round switches to Rounds tab and displays court assignments', async () => {
    await renderWithSelectedLeague(players, courts, []);

    // Wait for players and courts to be loaded (context bar shows correct counts)
    await waitFor(() => {
      const contextBar = document.querySelector('.context-bar');
      const playersItem = Array.from(contextBar!.querySelectorAll('.context-item')).find(
        item => item.querySelector('.context-label')?.textContent === 'Players'
      );
      expect(playersItem?.querySelector('.context-value')?.textContent).toBe('4');
    });

    // The start session button should be enabled (4 players, 1 court)
    const startBtn = screen.getByText('Start Session →');
    expect(startBtn).not.toBeDisabled();

    // Mock the generateRound API call before clicking Start Session
    // (in manual mode, Start Session generates Round 1 immediately)
    mockedApi.generateRound.mockResolvedValue(round1);
    mockedApi.getAssignments.mockResolvedValue(assignmentsR1);
    mockedApi.getByeCounts.mockResolvedValue({});

    // Click "Start Session →" — generates Round 1 and switches to Rounds tab
    fireEvent.click(startBtn);

    // Wait for the round to be generated and assignments displayed
    await waitFor(() => {
      expect(mockedApi.generateRound).toHaveBeenCalledWith('league-1');
    });

    // The "Start Round" hero button should appear (round generated but not started)
    await waitFor(() => {
      expect(screen.getByText(/START ROUND 1/)).toBeInTheDocument();
    });

    // The Rounds tab should now show Round 1 heading
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();
    });

    // Court assignments should be displayed
    await waitFor(() => {
      expect(screen.getByText('Court 1')).toBeInTheDocument();
    });

    // Player names should be visible in the assignments
    expect(screen.getByText('Team 1')).toBeInTheDocument();
    expect(screen.getByText('Team 2')).toBeInTheDocument();

    // Context bar should show 1 round
    const contextBar = document.querySelector('.context-bar');
    const roundsItem = Array.from(contextBar!.querySelectorAll('.context-item')).find(
      item => item.querySelector('.context-label')?.textContent === 'Rounds'
    );
    expect(roundsItem?.querySelector('.context-value')?.textContent).toBe('1');
  });

  // F10.2: Navigate between rounds — RoundNavigator + RoundDisplay updates
  // Validates: Requirements 10.2
  it('F10.2 - navigating between rounds updates the RoundDisplay with selected round assignments', async () => {
    // Start with 3 rounds already generated
    const initialRounds = [round1, round2, round3];

    mockedApi.listLeagues.mockResolvedValue([league]);
    mockedApi.selectLeague.mockResolvedValue(undefined);
    mockedApi.getPlayers.mockResolvedValue(players);
    mockedApi.getCourts.mockResolvedValue(courts);
    mockedApi.listRounds.mockResolvedValue(initialRounds);
    mockedApi.getByeCounts.mockResolvedValue({});

    // Set up assignment mocks to return different data per round
    mockedApi.getAssignments.mockImplementation(async (roundId: string) => {
      if (roundId === 'r1') return assignmentsR1;
      if (roundId === 'r2') return assignmentsR2;
      if (roundId === 'r3') return assignmentsR3;
      return [];
    });

    render(<App />);

    // Wait for sessions list
    await waitFor(() => {
      expect(screen.getByText('Your Sessions')).toBeInTheDocument();
    });

    // Click Resume to select the league
    fireEvent.click(screen.getByText('Resume'));

    // Wait for context bar to appear with league name
    await waitFor(() => {
      expect(screen.getByText('Test League')).toBeInTheDocument();
    });

    // Wait for rounds data to load
    await waitFor(() => {
      const contextBar = document.querySelector('.context-bar');
      const roundsItem = Array.from(contextBar!.querySelectorAll('.context-item')).find(
        item => item.querySelector('.context-label')?.textContent === 'Rounds'
      );
      expect(roundsItem?.querySelector('.context-value')?.textContent).toBe('3');
    });

    // Switch to Rounds tab using the tab button (not the context bar label)
    const tabButtons = screen.getAllByRole('button');
    const roundsTab = tabButtons.find(btn => btn.textContent === 'Rounds' && btn.classList.contains('tab-btn'));
    fireEvent.click(roundsTab!);

    // Wait for round display to show Round 3 heading (the last/current round)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Round 3' })).toBeInTheDocument();
    });

    // Navigate to Round 1 by clicking its tab in the RoundNavigator
    fireEvent.click(screen.getByRole('button', { name: 'Round 1' }));

    // Wait for assignments to load for round 1
    await waitFor(() => {
      expect(mockedApi.getAssignments).toHaveBeenCalledWith('r1');
    });

    // The heading should update to Round 1
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();
    });

    // Navigate to Round 2
    fireEvent.click(screen.getByRole('button', { name: 'Round 2' }));

    // Wait for assignments to load for round 2
    await waitFor(() => {
      expect(mockedApi.getAssignments).toHaveBeenCalledWith('r2');
    });

    // The heading should update to Round 2
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Round 2' })).toBeInTheDocument();
    });
  });

  // F10.3: Insufficient players/courts — session start button disabled, hint message shown
  // Validates: Requirements 10.3
  it('F10.3 - with fewer than 4 players, start button is disabled and hint is shown', async () => {
    const fewPlayers: Player[] = [
      { id: 'p1', leagueId: 'league-1', name: 'Alice', createdAt: new Date() },
      { id: 'p2', leagueId: 'league-1', name: 'Bob', createdAt: new Date() },
    ];

    await renderWithSelectedLeague(fewPlayers, courts, []);

    // Wait for Setup tab content
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Players' })).toBeInTheDocument();
    });

    // The start session button should be disabled
    const startBtn = screen.getByText('Start Session →');
    expect(startBtn).toBeDisabled();

    // Hint message should be shown about needing more players
    expect(screen.getByText('Add at least 4 players to start')).toBeInTheDocument();
  });

  it('F10.3 - with 0 courts, start button is disabled and hint is shown', async () => {
    await renderWithSelectedLeague(players, [], []);

    // Wait for players to load (context bar shows player count)
    await waitFor(() => {
      expect(screen.getByText('Add at least 1 court to start')).toBeInTheDocument();
    });

    // The start session button should be disabled
    const startBtn = screen.getByText('Start Session →');
    expect(startBtn).toBeDisabled();

    // Hint message should be shown about needing courts
    expect(screen.getByText('Add at least 1 court to start')).toBeInTheDocument();
  });
});
