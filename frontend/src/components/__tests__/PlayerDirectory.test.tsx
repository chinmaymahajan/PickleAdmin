import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PlayerManager from '../PlayerManager';
import { api } from '../../api/client';
import { Player } from '../../types';

jest.mock('../../api/client');
const mockedApi = api as jest.Mocked<typeof api>;

const mockPlayers: Player[] = [
  { id: '1', leagueId: 'l1', name: 'Alice', createdAt: new Date() },
  { id: '2', leagueId: 'l1', name: 'Bob', createdAt: new Date() },
];

const directoryNames = ['Charlie', 'Diana', 'Eve', 'Frank'];

function renderPlayerManager(players = mockPlayers) {
  const onAddPlayer = jest.fn().mockResolvedValue(undefined);
  const onRemovePlayer = jest.fn().mockResolvedValue(undefined);
  render(
    <PlayerManager
      leagueId="l1"
      players={players}
      onAddPlayer={onAddPlayer}
      onRemovePlayer={onRemovePlayer}
    />
  );
  return { onAddPlayer, onRemovePlayer };
}

describe('Player Directory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.getPlayerDirectory.mockResolvedValue(directoryNames);
    mockedApi.getPlayerSuggestions.mockResolvedValue([]);
  });

  it('shows Player Directory button when directory has entries', async () => {
    renderPlayerManager();
    await waitFor(() => {
      expect(screen.getByText('Player Directory')).toBeInTheDocument();
    });
  });

  it('hides Player Directory button when directory is empty', async () => {
    mockedApi.getPlayerDirectory.mockResolvedValue([]);
    renderPlayerManager();
    await waitFor(() => {
      expect(mockedApi.getPlayerDirectory).toHaveBeenCalled();
    });
    expect(screen.queryByText('Player Directory')).not.toBeInTheDocument();
  });

  it('shows badge with count of available directory players', async () => {
    renderPlayerManager();
    await waitFor(() => {
      expect(screen.getByText('4')).toBeInTheDocument();
    });
  });

  it('opens modal when Player Directory button is clicked', async () => {
    renderPlayerManager();
    await waitFor(() => {
      expect(screen.getByText('Player Directory')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Player Directory'));
    expect(screen.getByPlaceholderText('Search players…')).toBeInTheDocument();
    for (const name of directoryNames) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('filters players when typing in search', async () => {
    renderPlayerManager();
    await waitFor(() => {
      expect(screen.getByText('Player Directory')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Player Directory'));

    const searchInput = screen.getByPlaceholderText('Search players…');
    fireEvent.change(searchInput, { target: { value: 'dia' } });

    expect(screen.getByText('Diana')).toBeInTheDocument();
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
    expect(screen.queryByText('Eve')).not.toBeInTheDocument();
  });

  it('shows empty message when search has no matches', async () => {
    renderPlayerManager();
    await waitFor(() => {
      expect(screen.getByText('Player Directory')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Player Directory'));

    const searchInput = screen.getByPlaceholderText('Search players…');
    fireEvent.change(searchInput, { target: { value: 'zzz' } });

    expect(screen.getByText('No matching players')).toBeInTheDocument();
  });

  it('calls onAddPlayer when tapping + button on a player', async () => {
    const { onAddPlayer } = renderPlayerManager();
    await waitFor(() => {
      expect(screen.getByText('Player Directory')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Player Directory'));

    const addBtn = screen.getByLabelText('Add Charlie');
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(onAddPlayer).toHaveBeenCalledWith('Charlie');
  });

  it('closes modal when clicking the close button', async () => {
    renderPlayerManager();
    await waitFor(() => {
      expect(screen.getByText('Player Directory')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Player Directory'));
    expect(screen.getByPlaceholderText('Search players…')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Close directory'));

    expect(screen.queryByPlaceholderText('Search players…')).not.toBeInTheDocument();
  });

  it('closes modal when clicking the overlay', async () => {
    renderPlayerManager();
    await waitFor(() => {
      expect(screen.getByText('Player Directory')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Player Directory'));

    const overlay = screen.getByPlaceholderText('Search players…').closest('.directory-modal')!.parentElement!;
    fireEvent.click(overlay);

    expect(screen.queryByPlaceholderText('Search players…')).not.toBeInTheDocument();
  });

  it('excludes current session players from directory call', async () => {
    renderPlayerManager();
    await waitFor(() => {
      expect(mockedApi.getPlayerDirectory).toHaveBeenCalledWith(['Alice', 'Bob']);
    });
  });
});
