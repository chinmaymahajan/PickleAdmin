import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../App';
import { api } from '../../api/client';
import { League, Player, Court, LeagueFormat } from '../../types';

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

/**
 * Helper: renders App and selects the pre-existing league so we land on the Setup tab.
 * Returns after the context bar is visible with the league name.
 */
async function renderWithSelectedLeague(
  initialPlayers: Player[] = [],
  initialCourts: Court[] = [],
) {
  // Initial load returns one league
  mockedApi.listLeagues.mockResolvedValue([league]);
  mockedApi.selectLeague.mockResolvedValue(undefined);
  mockedApi.getPlayers.mockResolvedValue(initialPlayers);
  mockedApi.getCourts.mockResolvedValue(initialCourts);
  mockedApi.listRounds.mockResolvedValue([]);

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

  // Ensure Setup tab content is visible (PlayerManager + CourtManager)
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Players' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Courts' })).toBeInTheDocument();
  });

  // Wait for loadLeagueData to finish (loading overlay disappears)
  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
}

describe('Player & Court Management Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // F9.1: Add player — player in list, player count updated in context bar
  // Validates: Requirements 9.1
  it('F9.1 - adding a player shows it in the list and updates the context bar count', async () => {
    await renderWithSelectedLeague();

    const newPlayer: Player = {
      id: 'p1',
      leagueId: 'league-1',
      name: 'Alice',
      createdAt: new Date(),
    };

    mockedApi.addPlayer.mockResolvedValue(newPlayer);

    // Type player name and click Add
    const playerInput = screen.getByPlaceholderText('Player name');
    fireEvent.change(playerInput, { target: { value: 'Alice' } });
    fireEvent.click(screen.getAllByText('Add')[0]); // First Add button is for players

    // Wait for the player to appear in the list
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    // Verify addPlayer was called with correct args
    expect(mockedApi.addPlayer).toHaveBeenCalledWith('league-1', 'Alice');

    // Context bar should show player count of 1
    // The context bar has a "Players" label followed by the count
    const contextBar = document.querySelector('.context-bar');
    expect(contextBar).toBeTruthy();
    // Find the context-item for Players and check its value
    const contextItems = contextBar!.querySelectorAll('.context-item');
    const playersItem = Array.from(contextItems).find(
      item => item.querySelector('.context-label')?.textContent === 'Players'
    );
    expect(playersItem?.querySelector('.context-value')?.textContent).toBe('1');
  });

  // F9.2: Remove player — player removed from list, count decremented
  // Validates: Requirements 9.2
  it('F9.2 - removing a player removes it from the list and decrements the context bar count', async () => {
    const existingPlayer: Player = {
      id: 'p1',
      leagueId: 'league-1',
      name: 'Bob',
      createdAt: new Date(),
    };

    await renderWithSelectedLeague([existingPlayer]);

    // Verify Bob is in the list and count is 1
    expect(screen.getByText('Bob')).toBeInTheDocument();
    const contextBar = document.querySelector('.context-bar');
    let playersItem = Array.from(contextBar!.querySelectorAll('.context-item')).find(
      item => item.querySelector('.context-label')?.textContent === 'Players'
    );
    expect(playersItem?.querySelector('.context-value')?.textContent).toBe('1');

    // Mock deletePlayer
    mockedApi.deletePlayer.mockResolvedValue(undefined);

    // Click the remove button for Bob
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bob' }));

    // Wait for Bob to be removed from the list
    await waitFor(() => {
      expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    });

    expect(mockedApi.deletePlayer).toHaveBeenCalledWith('p1');

    // Context bar player count should now be 0
    playersItem = Array.from(contextBar!.querySelectorAll('.context-item')).find(
      item => item.querySelector('.context-label')?.textContent === 'Players'
    );
    expect(playersItem?.querySelector('.context-value')?.textContent).toBe('0');
  });

  // F9.3: Add court — court in list, court count updated in context bar
  // Validates: Requirements 9.3
  it('F9.3 - adding a court shows it in the list and updates the context bar count', async () => {
    await renderWithSelectedLeague();

    const newCourt: Court = {
      id: 'c1',
      leagueId: 'league-1',
      identifier: 'Court 1',
      createdAt: new Date(),
    };

    mockedApi.addCourt.mockResolvedValue(newCourt);

    // The court input has placeholder "Court #" and type="number"
    const courtInput = screen.getByPlaceholderText('Court #');
    fireEvent.change(courtInput, { target: { value: '1' } });

    // The second Add button is for courts
    const addButtons = screen.getAllByText('Add');
    fireEvent.click(addButtons[1]);

    // Wait for the court to appear in the list
    await waitFor(() => {
      expect(screen.getByText('Court 1')).toBeInTheDocument();
    });

    // Verify addCourt was called — CourtManager prepends "Court " to the number
    expect(mockedApi.addCourt).toHaveBeenCalledWith('league-1', 'Court 1');

    // Context bar should show court count of 1
    const contextBar = document.querySelector('.context-bar');
    const courtsItem = Array.from(contextBar!.querySelectorAll('.context-item')).find(
      item => item.querySelector('.context-label')?.textContent === 'Courts'
    );
    expect(courtsItem?.querySelector('.context-value')?.textContent).toBe('1');
  });

  // F9.4: Remove court — court removed from list, count decremented
  // Validates: Requirements 9.4
  it('F9.4 - removing a court removes it from the list and decrements the context bar count', async () => {
    const existingCourt: Court = {
      id: 'c1',
      leagueId: 'league-1',
      identifier: 'Court 1',
      createdAt: new Date(),
    };

    await renderWithSelectedLeague([], [existingCourt]);

    // Verify Court 1 is in the list and count is 1
    expect(screen.getByText('Court 1')).toBeInTheDocument();
    const contextBar = document.querySelector('.context-bar');
    let courtsItem = Array.from(contextBar!.querySelectorAll('.context-item')).find(
      item => item.querySelector('.context-label')?.textContent === 'Courts'
    );
    expect(courtsItem?.querySelector('.context-value')?.textContent).toBe('1');

    // Mock deleteCourt
    mockedApi.deleteCourt.mockResolvedValue(undefined);

    // Click the remove button for Court 1
    fireEvent.click(screen.getByRole('button', { name: 'Remove Court 1' }));

    // Wait for Court 1 to be removed from the list
    await waitFor(() => {
      expect(screen.queryByText('Court 1')).not.toBeInTheDocument();
    });

    expect(mockedApi.deleteCourt).toHaveBeenCalledWith('c1');

    // Context bar court count should now be 0
    courtsItem = Array.from(contextBar!.querySelectorAll('.context-item')).find(
      item => item.querySelector('.context-label')?.textContent === 'Courts'
    );
    expect(courtsItem?.querySelector('.context-value')?.textContent).toBe('0');
  });
});
