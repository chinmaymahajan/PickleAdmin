import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../App';
import { api } from '../../api/client';
import { League, LeagueFormat } from '../../types';

// Mock the api client module
jest.mock('../../api/client');
const mockedApi = api as jest.Mocked<typeof api>;

// Suppress localStorage warnings in test environment
beforeAll(() => {
  Storage.prototype.getItem = jest.fn(() => null);
  Storage.prototype.setItem = jest.fn();
});

describe('League Selection Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // F8.1: App renders with no leagues — LeagueSelector shown with "create new league" option
  // Validates: Requirements 8.1
  it('F8.1 - renders LeagueSelector with create option when no leagues exist', async () => {
    mockedApi.listLeagues.mockResolvedValue([]);

    render(<App />);

    // Wait for the landing page to appear (after listLeagues resolves)
    await waitFor(() => {
      expect(screen.getByText('Welcome to Pickle Admin')).toBeInTheDocument();
    });

    // Should show the "Start New Session" CTA button
    expect(screen.getByText('Start New Session')).toBeInTheDocument();

    // Verify listLeagues was called on mount
    expect(mockedApi.listLeagues).toHaveBeenCalledTimes(1);
  });

  // F8.2: Create new league — league name in context bar, Setup tab with PlayerManager + CourtManager
  // Validates: Requirements 8.2
  it('F8.2 - creating a new league shows context bar and Setup tab', async () => {
    const createdLeague: League = {
      id: 'league-1',
      name: 'Tuesday Ladder',
      format: LeagueFormat.ROUND_ROBIN,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Initial load: no leagues
    mockedApi.listLeagues.mockResolvedValue([]);
    // createLeague returns the new league
    mockedApi.createLeague.mockResolvedValue(createdLeague);
    // selectLeague succeeds
    mockedApi.selectLeague.mockResolvedValue(undefined);
    // After league is selected, load league data
    mockedApi.getPlayers.mockResolvedValue([]);
    mockedApi.getCourts.mockResolvedValue([]);
    mockedApi.listRounds.mockResolvedValue([]);

    render(<App />);

    // Wait for landing page
    await waitFor(() => {
      expect(screen.getByText('Start New Session')).toBeInTheDocument();
    });

    // Click "Start New Session" to show the create form
    fireEvent.click(screen.getByText('Start New Session'));

    // Fill in the session name
    const nameInput = await screen.findByPlaceholderText('Session name (e.g. Tuesday Ladder)');
    fireEvent.change(nameInput, { target: { value: 'Tuesday Ladder' } });

    // Submit the form
    fireEvent.click(screen.getByText('Create'));

    // Wait for the league to be created and selected
    await waitFor(() => {
      expect(mockedApi.createLeague).toHaveBeenCalledWith('Tuesday Ladder', LeagueFormat.ROUND_ROBIN);
    });

    // Wait for context bar to show the league name
    await waitFor(() => {
      expect(screen.getByText('Tuesday Ladder')).toBeInTheDocument();
    });

    // Context bar should be visible with league info
    expect(screen.getByText('League')).toBeInTheDocument();
    expect(screen.getByText('Round Robin')).toBeInTheDocument();

    // Setup tab should be active with PlayerManager and CourtManager
    // Use the h2 headings inside the manager components to verify they're rendered
    const playerHeading = screen.getByRole('heading', { name: 'Players' });
    expect(playerHeading).toBeInTheDocument();
    const courtHeading = screen.getByRole('heading', { name: 'Courts' });
    expect(courtHeading).toBeInTheDocument();
  });

  // F8.3: Select existing league — league data loaded (players, courts, rounds displayed)
  // Validates: Requirements 8.3
  it('F8.3 - selecting an existing league loads and displays league data', async () => {
    const existingLeague: League = {
      id: 'league-existing',
      name: 'Summer League',
      format: LeagueFormat.ROUND_ROBIN,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const players = [
      { id: 'p1', leagueId: 'league-existing', name: 'Alice', createdAt: new Date() },
      { id: 'p2', leagueId: 'league-existing', name: 'Bob', createdAt: new Date() },
      { id: 'p3', leagueId: 'league-existing', name: 'Charlie', createdAt: new Date() },
      { id: 'p4', leagueId: 'league-existing', name: 'Diana', createdAt: new Date() },
    ];

    const courts = [
      { id: 'c1', leagueId: 'league-existing', identifier: 'Court 1', createdAt: new Date() },
    ];

    const rounds = [
      { id: 'r1', leagueId: 'league-existing', roundNumber: 1, createdAt: new Date() },
    ];

    const assignments = [
      {
        id: 'a1',
        roundId: 'r1',
        courtId: 'c1',
        team1PlayerIds: ['p1', 'p2'],
        team2PlayerIds: ['p3', 'p4'],
        createdAt: new Date(),
      },
    ];

    // Initial load: one existing league
    mockedApi.listLeagues.mockResolvedValue([existingLeague]);
    // selectLeague succeeds
    mockedApi.selectLeague.mockResolvedValue(undefined);
    // Load league data after selection
    mockedApi.getPlayers.mockResolvedValue(players);
    mockedApi.getCourts.mockResolvedValue(courts);
    mockedApi.listRounds.mockResolvedValue(rounds);
    // Load assignments for the current round
    mockedApi.getAssignments.mockResolvedValue(assignments);
    mockedApi.getByeCounts.mockResolvedValue({});

    render(<App />);

    // Wait for the sessions list to appear
    await waitFor(() => {
      expect(screen.getByText('Your Sessions')).toBeInTheDocument();
    });

    // The existing league should be shown as a session card
    expect(screen.getByText('Summer League')).toBeInTheDocument();

    // Click "Resume" to select the league
    fireEvent.click(screen.getByText('Resume'));

    // Wait for selectLeague to be called
    await waitFor(() => {
      expect(mockedApi.selectLeague).toHaveBeenCalledWith('league-existing');
    });

    // Wait for league data to load — context bar should show league name
    await waitFor(() => {
      // Context bar shows player count
      const playerCountElements = screen.getAllByText('4');
      expect(playerCountElements.length).toBeGreaterThan(0);
    });

    // Verify league data was loaded
    expect(mockedApi.getPlayers).toHaveBeenCalledWith('league-existing');
    expect(mockedApi.getCourts).toHaveBeenCalledWith('league-existing');
    expect(mockedApi.listRounds).toHaveBeenCalledWith('league-existing');

    // Context bar should show the league name and counts
    expect(screen.getByText('Summer League')).toBeInTheDocument();

    // Rounds count should be visible in context bar
    const roundsCountElements = screen.getAllByText('1');
    expect(roundsCountElements.length).toBeGreaterThan(0);
  });
});
