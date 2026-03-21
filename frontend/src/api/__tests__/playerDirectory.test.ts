import { api } from '../localStorageApi';

const DIRECTORY_KEY = 'pickleadmin_player_directory';

describe('getPlayerDirectory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty array when directory is empty', async () => {
    const result = await api.getPlayerDirectory([]);
    expect(result).toEqual([]);
  });

  it('returns all names sorted alphabetically', async () => {
    localStorage.setItem(DIRECTORY_KEY, JSON.stringify(['Charlie', 'Alice', 'Bob']));
    const result = await api.getPlayerDirectory([]);
    expect(result).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('excludes names already in the current session (case-insensitive)', async () => {
    localStorage.setItem(DIRECTORY_KEY, JSON.stringify(['Alice', 'Bob', 'Charlie', 'Diana']));
    const result = await api.getPlayerDirectory(['alice', 'Diana']);
    expect(result).toEqual(['Bob', 'Charlie']);
  });

  it('returns empty array when all directory names are excluded', async () => {
    localStorage.setItem(DIRECTORY_KEY, JSON.stringify(['Alice', 'Bob']));
    const result = await api.getPlayerDirectory(['Alice', 'Bob']);
    expect(result).toEqual([]);
  });

  it('handles large directories', async () => {
    const names = Array.from({ length: 300 }, (_, i) => `Player ${String(i).padStart(3, '0')}`);
    localStorage.setItem(DIRECTORY_KEY, JSON.stringify(names));
    const result = await api.getPlayerDirectory(['Player 000', 'Player 150']);
    expect(result).toHaveLength(298);
    expect(result).not.toContain('Player 000');
    expect(result).not.toContain('Player 150');
    // Verify sorted
    for (let i = 1; i < result.length; i++) {
      expect(result[i].localeCompare(result[i - 1])).toBeGreaterThanOrEqual(0);
    }
  });
});
