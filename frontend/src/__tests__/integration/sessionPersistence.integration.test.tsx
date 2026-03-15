import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
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

function makeAssignments(roundId: string): Assignment[] {
  return [{
    id: `a-${roundId}`, roundId, courtId: 'c1',
    team1PlayerIds: ['p1', 'p2'], team2PlayerIds: ['p3', 'p4'],
    createdAt: new Date(),
  }];
}

const allRounds = [makeRound(1), makeRound(2), makeRound(3)];

// Simulated localStorage store
let store: Record<string, string> = {};

function setupMockLocalStorage(initial: Record<string, string> = {}) {
  store = { ...initial };
  Storage.prototype.getItem = jest.fn((key: string) => store[key] ?? null);
  Storage.prototype.setItem = jest.fn((key: string, value: string) => { store[key] = value; });
  Storage.prototype.removeItem = jest.fn((key: string) => { delete store[key]; });
}

function setupApiMocks(opts: { roundsGenerated?: boolean } = {}) {
  const { roundsGenerated = false } = opts;
  mockedApi.listLeagues.mockResolvedValue([league]);
  mockedApi.selectLeague.mockResolvedValue(undefined);
  mockedApi.getPlayers.mockResolvedValue(players);
  mockedApi.getCourts.mockResolvedValue(courts);
  mockedApi.getByeCounts.mockResolvedValue({});
  mockedApi.getAssignments.mockImplementation(async (roundId: string) => makeAssignments(roundId));

  let genCount = 0;
  mockedApi.generateRound.mockImplementation(async () => {
    const round = allRounds[genCount] || makeRound(genCount + 1);
    genCount++;
    return round;
  });
  mockedApi.listRounds.mockImplementation(async () => {
    return (roundsGenerated || genCount >= allRounds.length) ? allRounds : [];
  });
}

async function selectLeagueAndGoToSetup() {
  await waitFor(() => expect(screen.getByText('Your Sessions')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Resume'));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Players' })).toBeInTheDocument());
}

async function switchToAutoAndStart() {
  fireEvent.click(screen.getByText('Auto'));
  await waitFor(() => expect(screen.getByText('Break Between Rounds')).toBeInTheDocument());
  const startBtn = screen.getByText('Start Session →');
  await act(async () => { fireEvent.click(startBtn); });
  await waitFor(() => expect(mockedApi.generateRound).toHaveBeenCalled());
}

describe('Session Persistence on Refresh', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    cleanup();
  });

  it('should persist active round number to localStorage during auto session', async () => {
    setupMockLocalStorage({
      sessionMode: 'auto',
      breakMinutes: '2',
      totalRoundsPlanned: '3',
      roundDurationMinutes: '10',
    });
    setupApiMocks();
    render(<App />);
    await selectLeagueAndGoToSetup();
    await switchToAutoAndStart();

    // Advance past initial break (2 min) to activate Round 1
    await act(async () => { jest.advanceTimersByTime(2 * 60 * 1000 + 100); });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();
    });

    // Check that session state was persisted
    const setItemCalls = (Storage.prototype.setItem as jest.Mock).mock.calls;
    const sessionStateCalls = setItemCalls.filter(([key]: [string]) => key.startsWith('sessionState_'));
    expect(sessionStateCalls.length).toBeGreaterThan(0);

    // The last persisted state should have autoActiveRoundNumber = 1
    const lastCall = sessionStateCalls[sessionStateCalls.length - 1];
    const persisted = JSON.parse(lastCall[1]);
    expect(persisted.autoActiveRoundNumber).toBe(1);
    expect(persisted.isOnBreak).toBe(false);
  });

  it('should restore active round from localStorage on remount (simulated refresh)', async () => {
    const futureTimer = Date.now() + 5 * 60 * 1000; // 5 min from now
    const cachedState = JSON.stringify({
      autoActiveRoundNumber: 1,
      timerEndTime: futureTimer,
      isOnBreak: false,
      timerHidden: false,
      activeTab: 'rounds',
    });

    setupMockLocalStorage({
      sessionMode: 'auto',
      breakMinutes: '2',
      totalRoundsPlanned: '3',
      roundDurationMinutes: '10',
      selectedLeagueId: 'league-1',
      'sessionState_league-1': cachedState,
    });

    // API returns rounds (session was in progress)
    setupApiMocks({ roundsGenerated: true });

    render(<App />);

    // Should restore directly to the rounds tab showing Round 1
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();
    });

    // Timer should be active (not expired)
    await waitFor(() => {
      const timerLabel = document.querySelector('.timer-label');
      expect(timerLabel?.textContent).toBe('remaining');
    });
  });

  it('should NOT auto-advance when restoring an expired timer from localStorage', async () => {
    const expiredTimer = Date.now() - 60 * 1000; // 1 min ago (expired)
    const cachedState = JSON.stringify({
      autoActiveRoundNumber: 1,
      timerEndTime: expiredTimer,
      isOnBreak: false,
      timerHidden: false,
      activeTab: 'rounds',
    });

    setupMockLocalStorage({
      sessionMode: 'auto',
      breakMinutes: '2',
      totalRoundsPlanned: '3',
      roundDurationMinutes: '10',
      selectedLeagueId: 'league-1',
      'sessionState_league-1': cachedState,
    });

    setupApiMocks({ roundsGenerated: true });

    render(<App />);

    // Should show Round 1 (the restored round), NOT advance to break or Round 2
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();
    });

    // Wait a bit to ensure no auto-advance fires
    await act(async () => { jest.advanceTimersByTime(5000); });

    // Still on Round 1
    expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();

    // Should NOT show break state
    const timerDiv = document.querySelector('.round-timer.on-break');
    expect(timerDiv).toBeNull();
  });

  it('should NOT advance on repeated remounts (simulated multiple refreshes)', async () => {
    // First mount: Round 1 active, timer running
    const futureTimer = Date.now() + 8 * 60 * 1000;
    const cachedState = JSON.stringify({
      autoActiveRoundNumber: 1,
      timerEndTime: futureTimer,
      isOnBreak: false,
      timerHidden: false,
      activeTab: 'rounds',
    });

    setupMockLocalStorage({
      sessionMode: 'auto',
      breakMinutes: '2',
      totalRoundsPlanned: '3',
      roundDurationMinutes: '10',
      selectedLeagueId: 'league-1',
      'sessionState_league-1': cachedState,
    });
    setupApiMocks({ roundsGenerated: true });

    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();
    });

    // Unmount (simulate page close)
    unmount();

    // Capture what was saved to localStorage
    const setItemCalls = (Storage.prototype.setItem as jest.Mock).mock.calls;
    const lastSessionSave = setItemCalls
      .filter(([key]: [string]) => key === 'sessionState_league-1')
      .pop();

    if (lastSessionSave) {
      // Use the saved state for the next mount
      store['sessionState_league-1'] = lastSessionSave[1];
    }

    // Second mount (simulated refresh)
    jest.clearAllMocks();
    setupApiMocks({ roundsGenerated: true });
    // Re-setup localStorage mock with current store
    Storage.prototype.getItem = jest.fn((key: string) => store[key] ?? null);
    Storage.prototype.setItem = jest.fn((key: string, value: string) => { store[key] = value; });
    Storage.prototype.removeItem = jest.fn((key: string) => { delete store[key]; });

    render(<App />);

    // Should still be on Round 1, not advanced
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();
    });

    // Timer should still be active
    await waitFor(() => {
      const timerLabel = document.querySelector('.timer-label');
      expect(timerLabel?.textContent).toBe('remaining');
    });
  });

  it('should restore break state from localStorage', async () => {
    const futureTimer = Date.now() + 90 * 1000; // 1.5 min left on break
    const cachedState = JSON.stringify({
      autoActiveRoundNumber: 1,
      timerEndTime: futureTimer,
      isOnBreak: true,
      timerHidden: false,
      activeTab: 'rounds',
    });

    setupMockLocalStorage({
      sessionMode: 'auto',
      breakMinutes: '2',
      totalRoundsPlanned: '3',
      roundDurationMinutes: '10',
      selectedLeagueId: 'league-1',
      'sessionState_league-1': cachedState,
    });
    setupApiMocks({ roundsGenerated: true });

    render(<App />);

    // Should show break state
    await waitFor(() => {
      const timerDiv = document.querySelector('.round-timer');
      expect(timerDiv).toBeTruthy();
      const timerLabel = document.querySelector('.timer-label');
      expect(timerLabel?.textContent).toBe('break');
    });
  });
});
