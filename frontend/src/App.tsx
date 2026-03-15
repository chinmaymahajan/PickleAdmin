import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import {
  LeagueSelector,
  PlayerManager,
  CourtManager,
  RoundDisplay,
  RoundNavigator,
  RoundGenerator,
  DevTools,
  TVDisplay
} from './components';
import { api } from './api/client';
import { League, Player, Court, Round, Assignment, LeagueFormat } from './types';
import CourtIcon from './components/CourtIcon';

function App() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(() => {
    return localStorage.getItem('selectedLeagueId');
  });
  const [players, setPlayers] = useState<Player[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [autoActiveRound, setAutoActiveRound] = useState<Round | null>(null);
  const [autoActiveAssignments, setAutoActiveAssignments] = useState<Assignment[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [byeCounts, setByeCounts] = useState<Record<string, number>>({});
  const [nextRound, setNextRound] = useState<Round | null>(null);
  const [nextAssignments, setNextAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'setup' | 'rounds'>('setup');
  const [tvMode, setTvMode] = useState(false);
  const [roundDurationMinutes, setRoundDurationMinutes] = useState<number>(() => {
    const saved = localStorage.getItem('roundDurationMinutes');
    return saved ? Number(saved) : 10;
  });
  const [timerEnabled, setTimerEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('timerEnabled');
    return saved ? JSON.parse(saved) : false;
  });
  const [sessionMode, setSessionMode] = useState<'manual' | 'auto'>(() => {
    const saved = localStorage.getItem('sessionMode');
    return saved === 'auto' ? 'auto' : 'manual';
  });
  const [breakMinutes, setBreakMinutes] = useState<number>(() => {
    const saved = localStorage.getItem('breakMinutes');
    return saved ? Number(saved) : 2;
  });
  const [totalRoundsPlanned, setTotalRoundsPlanned] = useState<number>(() => {
    const saved = localStorage.getItem('totalRoundsPlanned');
    return saved ? Number(saved) : 6;
  });
  const [pendingModeSwitch, setPendingModeSwitch] = useState<'manual' | 'auto' | null>(null);
  const [timerEndTime, setTimerEndTime] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [timerHidden, setTimerHidden] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  // Per-league session state cache — preserves timer/break state when switching leagues
  interface LeagueSessionState {
    autoActiveRound: Round | null;
    timerEndTime: number | null;
    isOnBreak: boolean;
    timerHidden: boolean;
    activeTab: 'setup' | 'rounds';
  }
  const leagueSessionCache = useRef<Map<string, LeagueSessionState>>(new Map());

  // --- Persist auto session state to localStorage ---
  const saveSessionState = (leagueId: string, state: LeagueSessionState) => {
    leagueSessionCache.current.set(leagueId, state);
    const serializable = {
      autoActiveRoundNumber: state.autoActiveRound?.roundNumber ?? null,
      timerEndTime: state.timerEndTime,
      isOnBreak: state.isOnBreak,
      timerHidden: state.timerHidden,
      activeTab: state.activeTab,
    };
    localStorage.setItem(`sessionState_${leagueId}`, JSON.stringify(serializable));
  };

  const loadSessionState = (leagueId: string, roundsData: Round[]): LeagueSessionState | null => {
    // Check in-memory cache first
    const cached = leagueSessionCache.current.get(leagueId);
    if (cached) return cached;
    // Fall back to localStorage
    const raw = localStorage.getItem(`sessionState_${leagueId}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const activeRound = parsed.autoActiveRoundNumber != null
        ? roundsData.find(r => r.roundNumber === parsed.autoActiveRoundNumber) ?? null
        : null;
      return {
        autoActiveRound: activeRound,
        timerEndTime: parsed.timerEndTime,
        isOnBreak: parsed.isOnBreak ?? false,
        timerHidden: parsed.timerHidden ?? false,
        activeTab: parsed.activeTab ?? 'setup',
      };
    } catch { return null; }
  };

  const clearSessionState = (leagueId: string) => {
    leagueSessionCache.current.delete(leagueId);
    localStorage.removeItem(`sessionState_${leagueId}`);
  };

  const initialLoadDone = useRef(false);
  const isRestoringSession = useRef(false);
  // Suppress auto-advance for one render cycle after session restore
  const suppressAdvanceRef = useRef(false);

  // Persist selectedLeagueId
  useEffect(() => {
    if (selectedLeagueId) {
      localStorage.setItem('selectedLeagueId', selectedLeagueId);
    } else {
      localStorage.removeItem('selectedLeagueId');
    }
  }, [selectedLeagueId]);

  // Persist auto session state whenever key values change (skip during restore)
  useEffect(() => {
    if (!initialLoadDone.current || isRestoringSession.current) return;
    if (!selectedLeagueId || sessionMode !== 'auto') return;
    saveSessionState(selectedLeagueId, {
      autoActiveRound,
      timerEndTime,
      isOnBreak,
      timerHidden,
      activeTab,
    });
  }, [selectedLeagueId, autoActiveRound, timerEndTime, isOnBreak, timerHidden, activeTab, sessionMode]);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  useEffect(() => { loadLeagues(); }, []);

  useEffect(() => {
    if (selectedLeagueId) loadLeagueData(selectedLeagueId);
  }, [selectedLeagueId]);

  useEffect(() => {
    if (currentRound) loadAssignments(currentRound.id);
  }, [currentRound]);

  // Pre-fetch next round assignments for TV break preview (based on auto-active round in auto mode)
  useEffect(() => {
    if (rounds.length === 0) {
      setNextRound(null);
      setNextAssignments([]);
      return;
    }

    // During initial break (auto mode, no active round yet), next round is the first round
    if (sessionMode === 'auto' && !autoActiveRound && isOnBreak) {
      const firstRound = rounds[0];
      setNextRound(firstRound);
      api.getAssignments(firstRound.id).then(setNextAssignments).catch(() => setNextAssignments([]));
      return;
    }

    const baseRound = sessionMode === 'auto' && autoActiveRound ? autoActiveRound : currentRound;
    if (!baseRound) {
      setNextRound(null);
      setNextAssignments([]);
      return;
    }
    const baseIndex = rounds.findIndex(r => r.id === baseRound.id);
    const upcoming = baseIndex >= 0 && baseIndex < rounds.length - 1
      ? rounds[baseIndex + 1]
      : null;
    setNextRound(upcoming);
    if (upcoming) {
      api.getAssignments(upcoming.id).then(setNextAssignments).catch(() => setNextAssignments([]));
    } else {
      setNextAssignments([]);
    }
  }, [currentRound, autoActiveRound, rounds, sessionMode, isOnBreak]);

  // Fetch auto-active round assignments for TV mode
  useEffect(() => {
    if (sessionMode !== 'auto' || !autoActiveRound) {
      setAutoActiveAssignments([]);
      return;
    }
    // If viewing the same round, no need to double-fetch
    if (currentRound && currentRound.id === autoActiveRound.id) {
      setAutoActiveAssignments([]);
      return;
    }
    api.getAssignments(autoActiveRound.id).then(setAutoActiveAssignments).catch(() => setAutoActiveAssignments([]));
  }, [autoActiveRound, currentRound, sessionMode]);

  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // Persist round duration
  useEffect(() => {
    localStorage.setItem('roundDurationMinutes', String(roundDurationMinutes));
  }, [roundDurationMinutes]);

  useEffect(() => {
    localStorage.setItem('timerEnabled', JSON.stringify(timerEnabled));
  }, [timerEnabled]);

  useEffect(() => {
    localStorage.setItem('sessionMode', sessionMode);
    if (sessionMode === 'auto') setTimerEnabled(true);
  }, [sessionMode]);

  useEffect(() => {
    localStorage.setItem('breakMinutes', String(breakMinutes));
  }, [breakMinutes]);

  useEffect(() => {
    localStorage.setItem('totalRoundsPlanned', String(totalRoundsPlanned));
  }, [totalRoundsPlanned]);

  // Countdown timer tick
  useEffect(() => {
    if (timerEndTime === null) {
      setTimeRemaining(0);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, timerEndTime - Date.now());
      setTimeRemaining(remaining);
      if (remaining <= 0 && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [timerEndTime]);

  const startTimer = useCallback(() => {
    if (timerEnabled && roundDurationMinutes > 0) {
      setTimerEndTime(Date.now() + roundDurationMinutes * 60 * 1000);
      setTimerHidden(false);
    }
  }, [timerEnabled, roundDurationMinutes]);

  const formatTime = (ms: number) => {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const timerActive = timerEndTime !== null && timeRemaining > 0;
  const timerExpired = timerEndTime !== null && timeRemaining <= 0;

  // Track whether we already handled the current timer expiration
  const timerHandledRef = useRef(false);
  const isOnBreakRef = useRef(isOnBreak);
  const autoActiveRoundRef = useRef(autoActiveRound);
  const roundsRef = useRef(rounds);

  // Keep refs in sync
  useEffect(() => { isOnBreakRef.current = isOnBreak; }, [isOnBreak]);
  useEffect(() => { autoActiveRoundRef.current = autoActiveRound; }, [autoActiveRound]);
  useEffect(() => { roundsRef.current = rounds; }, [rounds]);

  // Reset handled flag whenever a new timer starts
  useEffect(() => {
    if (timerActive) {
      timerHandledRef.current = false;
    }
  }, [timerActive]);

  // Auto-advance: when timer expires in auto mode, start break then next round
  useEffect(() => {
    if (sessionMode !== 'auto' || !timerExpired || !selectedLeagueId) return;
    if (timerHandledRef.current) return; // Already handled this expiration
    if (isRestoringSession.current) return; // Don't advance during session restore
    // Skip the first expiration after a session restore (from page refresh)
    if (suppressAdvanceRef.current) {
      suppressAdvanceRef.current = false;
      timerHandledRef.current = true;
      return;
    }
    timerHandledRef.current = true;

    const curRounds = roundsRef.current;
    const curAutoActive = autoActiveRoundRef.current;
    const curIsOnBreak = isOnBreakRef.current;

    if (curIsOnBreak) {
      // Break just ended — advance to next round (or first round if session just started)
      let targetRound: Round | undefined;
      if (!curAutoActive) {
        // Initial break before Round 1
        targetRound = curRounds.length > 0 ? curRounds[0] : undefined;
      } else {
        const currentIndex = curRounds.findIndex(r => r.id === curAutoActive.id);
        targetRound = currentIndex >= 0 && currentIndex < curRounds.length - 1
          ? curRounds[currentIndex + 1]
          : undefined;
      }
      if (!targetRound) { setIsOnBreak(false); return; }
      setIsOnBreak(false);
      setAutoActiveRound(targetRound);
      setCurrentRound(targetRound);
      setTimerEndTime(Date.now() + roundDurationMinutes * 60 * 1000);
    } else {
      // Round just ended
      if (!curAutoActive) return;
      const currentIndex = curRounds.findIndex(r => r.id === curAutoActive.id);
      const nextAutoRound = currentIndex >= 0 && currentIndex < curRounds.length - 1
        ? curRounds[currentIndex + 1]
        : undefined;
      if (!nextAutoRound) return; // Last round, stay expired
      if (breakMinutes > 0) {
        setIsOnBreak(true);
        setTimerEndTime(Date.now() + breakMinutes * 60 * 1000);
      } else {
        setAutoActiveRound(nextAutoRound);
        setCurrentRound(nextAutoRound);
        setTimerEndTime(Date.now() + roundDurationMinutes * 60 * 1000);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerExpired]);

  const selectedLeague = leagues.find(l => l.id === selectedLeagueId);
  const timerRound = sessionMode === 'auto' && autoActiveRound ? autoActiveRound : currentRound;
  const isLastRound = timerRound
    ? rounds.findIndex(r => r.id === timerRound.id) === rounds.length - 1
    : true;

  const loadLeagues = async () => {
    try { setLeagues(await api.listLeagues()); }
    catch (err: any) { setError(err.message || 'Failed to load leagues'); }
  };

  const loadLeagueData = async (leagueId: string) => {
    setLoading(true);
    setError(null);
    setPendingModeSwitch(null);
    isRestoringSession.current = true;
    try {
      const [playersData, courtsData, roundsData] = await Promise.all([
        api.getPlayers(leagueId),
        api.getCourts(leagueId),
        api.listRounds(leagueId)
      ]);
      setPlayers(playersData);
      setCourts(courtsData);
      setRounds(roundsData);

      // Restore auto session state if available
      const cached = loadSessionState(leagueId, roundsData);
      if (cached && sessionMode === 'auto' && roundsData.length > 0) {
        suppressAdvanceRef.current = true; // Prevent auto-advance from firing on restored expired timer
        if (cached.timerEndTime !== null && cached.timerEndTime <= Date.now()) {
          setAutoActiveRound(cached.autoActiveRound);
          setTimerEndTime(null);
          setIsOnBreak(cached.isOnBreak);
        } else {
          setAutoActiveRound(cached.autoActiveRound);
          setTimerEndTime(cached.timerEndTime);
          setIsOnBreak(cached.isOnBreak);
        }
        setTimerHidden(cached.timerHidden);
        setActiveTab(cached.activeTab);
        setCurrentRound(cached.autoActiveRound || roundsData[roundsData.length - 1]);
      } else {
        // No cached state — reset to defaults
        setAutoActiveRound(null);
        setTimerEndTime(null);
        setIsOnBreak(false);
        setTimerHidden(false);
        if (roundsData.length > 0) {
          setCurrentRound(roundsData[roundsData.length - 1]);
        } else {
          setCurrentRound(null);
          setAssignments([]);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load league data');
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
      isRestoringSession.current = false;
    }
  };

  const loadAssignments = async (roundId: string) => {
    try {
      setAssignments(await api.getAssignments(roundId));
      if (selectedLeagueId) {
        setByeCounts(await api.getByeCounts(selectedLeagueId));
      }
    }
    catch (err: any) { setError(err.message || 'Failed to load assignments'); }
  };

  const handleSelectLeague = async (leagueId: string) => {
    setError(null);
    setSuccessMessage(null);
    setTvMode(false);

    // Save current league's session state before switching
    if (selectedLeagueId) {
      saveSessionState(selectedLeagueId, {
        autoActiveRound,
        timerEndTime,
        isOnBreak,
        timerHidden,
        activeTab,
      });
    }

    if (!leagueId) {
      setSelectedLeagueId(null);
      setPlayers([]);
      setCourts([]);
      setRounds([]);
      setCurrentRound(null);
      setAutoActiveRound(null);
      setAssignments([]);
      setAutoActiveAssignments([]);
      setNextRound(null);
      setNextAssignments([]);
      setByeCounts({});
      setTimerEndTime(null);
      setIsOnBreak(false);
      setPendingModeSwitch(null);
      return;
    }

    // Session state restore is handled by loadLeagueData which has access to rounds data
    // Mark as restoring so persist effect doesn't overwrite cache with intermediate state
    isRestoringSession.current = true;
    setAutoActiveAssignments([]);
    setNextRound(null);
    setNextAssignments([]);
    setByeCounts({});
    setPendingModeSwitch(null);

    try {
      await api.selectLeague(leagueId);
      setSelectedLeagueId(leagueId);
    } catch (err: any) { setError(err.message || 'Failed to select league'); }
  };

  const handleCreateLeague = async (name: string, format: LeagueFormat) => {
    setError(null);
    setSuccessMessage(null);
    try {
      const league = await api.createLeague(name, format);
      setLeagues([...leagues, league]);
      setSuccessMessage(`League "${name}" created`);
      setActiveTab('setup');
      setSelectedLeagueId(league.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create league');
      throw err;
    }
  };

  const handleDeleteLeague = async (leagueId: string) => {
    setError(null);
    try {
      await api.deleteLeague(leagueId);
      leagueSessionCache.current.delete(leagueId);
      clearSessionState(leagueId);
      setLeagues(leagues.filter(l => l.id !== leagueId));
      if (selectedLeagueId === leagueId) {
        setSelectedLeagueId(null);
        setPlayers([]);
        setCourts([]);
        setRounds([]);
        setCurrentRound(null);
        setAutoActiveRound(null);
        setAssignments([]);
        setTimerEndTime(null);
        setIsOnBreak(false);
      }
      setSuccessMessage('Session deleted');
    } catch (err: any) {
      setError(err.message || 'Failed to delete session');
      throw err;
    }
  };

  const regenerateIfAutoSession = async () => {
    if (sessionMode !== 'auto' || !selectedLeagueId || !autoActiveRound || rounds.length === 0) return;
    try {
      const updatedRounds = await api.regenerateFutureRounds(selectedLeagueId, autoActiveRound.roundNumber);
      setRounds(updatedRounds);
      setSuccessMessage('Future rounds regenerated with updated roster');
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate future rounds');
    }
  };

  const handleAddPlayer = async (name: string) => {
    if (!selectedLeagueId) return;
    setError(null);
    setSuccessMessage(null);
    try {
      const player = await api.addPlayer(selectedLeagueId, name);
      setPlayers([...players, player]);
      setSuccessMessage(`${name} added`);
      await regenerateIfAutoSession();
    } catch (err: any) {
      setError(err.message || 'Failed to add player');
      throw err;
    }
  };

  const handleImportPlayers = async (names: string[]) => {
    if (!selectedLeagueId) return;
    setError(null);
    setSuccessMessage(null);
    const added: Player[] = [];
    for (const name of names) {
      try {
        const player = await api.addPlayer(selectedLeagueId, name);
        added.push(player);
      } catch { /* skip duplicates */ }
    }
    setPlayers(prev => [...prev, ...added]);
    setSuccessMessage(`${added.length} player${added.length !== 1 ? 's' : ''} imported`);
    await regenerateIfAutoSession();
  };

  const handleAddCourt = async (identifier: string) => {
    if (!selectedLeagueId) return;
    setError(null);
    setSuccessMessage(null);
    try {
      const court = await api.addCourt(selectedLeagueId, identifier);
      setCourts([...courts, court]);
      setSuccessMessage(`${identifier} added`);
      await regenerateIfAutoSession();
    } catch (err: any) {
      setError(err.message || 'Failed to add court');
      throw err;
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    setError(null);
    try {
      await api.deletePlayer(playerId);
      setPlayers(players.filter(p => p.id !== playerId));
      setSuccessMessage('Player removed');
      await regenerateIfAutoSession();
    } catch (err: any) { setError(err.message || 'Failed to remove player'); }
  };

  const handleRemoveCourt = async (courtId: string) => {
    setError(null);
    try {
      await api.deleteCourt(courtId);
      setCourts(courts.filter(c => c.id !== courtId));
      setSuccessMessage('Court removed');
      await regenerateIfAutoSession();
    } catch (err: any) { setError(err.message || 'Failed to remove court'); }
  };

  const handleGenerateRound = async () => {
    if (!selectedLeagueId) return;
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      const round = await api.generateRound(selectedLeagueId);
      setRounds([...rounds, round]);
      setCurrentRound(round);
      setActiveTab('rounds');
      startTimer();
      setSuccessMessage(`Round ${round.roundNumber} generated`);
    } catch (err: any) {
      setError(err.message || 'Failed to generate round');
      throw err;
    } finally { setLoading(false); }
  };

  const handleStartAutoSession = async () => {
    if (!selectedLeagueId) return;
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      for (let i = 0; i < totalRoundsPlanned; i++) {
        await api.generateRound(selectedLeagueId);
      }
      // Fetch all rounds from backend to stay in sync
      const allRounds = await api.listRounds(selectedLeagueId);
      const firstAutoRound = allRounds[allRounds.length - totalRoundsPlanned] || allRounds[0];
      setRounds(allRounds);
      setCurrentRound(firstAutoRound);
      setAutoActiveRound(null); // No active round yet — session starts with a break
      setActiveTab('rounds');
      // Start with an initial break so TV shows "Up Next — Round 1"
      setIsOnBreak(true);
      if (breakMinutes > 0) {
        setTimerEndTime(Date.now() + breakMinutes * 60 * 1000);
      } else {
        // No break configured — start Round 1 immediately
        setAutoActiveRound(firstAutoRound);
        setTimerEndTime(Date.now() + roundDurationMinutes * 60 * 1000);
        setIsOnBreak(false);
      }
      setSuccessMessage(`${totalRoundsPlanned} rounds generated — session starting`);
    } catch (err: any) {
      setError(err.message || 'Failed to start auto session');
    } finally { setLoading(false); }
  };

  const handleNavigateToRound = (roundNumber: number) => {
    const round = rounds.find(r => r.roundNumber === roundNumber);
    if (round) setCurrentRound(round);
  };

  const handleUpdateAssignments = async (updates: Array<{
    courtId: string;
    team1PlayerIds: string[];
    team2PlayerIds: string[];
  }>) => {
    if (!currentRound) return;
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      const updatedAssignments = await api.updateAssignments(currentRound.id, updates);
      setAssignments(updatedAssignments);
      setSuccessMessage('Assignments saved');
    } catch (err: any) {
      setError(err.message || 'Failed to update assignments');
      throw err;
    } finally { setLoading(false); }
  };

  const handleSeedMockData = async () => {
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      const data = await api.seedMockData();
      await loadLeagues();
      setSelectedLeagueId(data.league.id);
      setSuccessMessage(`Mock data created: ${data.players} players, ${data.courts} courts`);
    } catch (err: any) { setError(err.message || 'Failed to seed mock data'); }
    finally { setLoading(false); }
  };

  const handleClearAllData = async () => {
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      await api.clearAllData();
      setLeagues([]);
      setSelectedLeagueId(null);
      setPlayers([]);
      setCourts([]);
      setRounds([]);
      setCurrentRound(null);
      setAutoActiveRound(null);
      setAssignments([]);
      setPendingModeSwitch(null);
      setSuccessMessage('All data cleared');
    } catch (err: any) { setError(err.message || 'Failed to clear data'); }
    finally { setLoading(false); }
  };

  const formatLabel = (f: string) => f === 'round_robin' ? 'Round Robin' : f;

  const handleModeSwitch = (newMode: 'manual' | 'auto') => {
    if (newMode === sessionMode) return;
    if (rounds.length > 0) {
      setPendingModeSwitch(newMode);
    } else {
      setSessionMode(newMode);
    }
  };

  const confirmModeSwitch = async () => {
    if (!pendingModeSwitch || !selectedLeagueId) return;
    try {
      await api.clearRounds(selectedLeagueId);
      setRounds([]);
      setCurrentRound(null);
      setAutoActiveRound(null);
      setAssignments([]);
      setAutoActiveAssignments([]);
      setNextRound(null);
      setNextAssignments([]);
      setByeCounts({});
      setTimerEndTime(null);
      setIsOnBreak(false);
      setSessionMode(pendingModeSwitch);
      setPendingModeSwitch(null);
      setActiveTab('setup');
      setSuccessMessage(`Switched to ${pendingModeSwitch} mode — session reset`);
    } catch (err: any) {
      setError(err.message || 'Failed to switch mode');
    }
  };



  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      <header>
        <h1>🏓 DinkTank</h1>
        <button
          className="theme-toggle"
          onClick={() => setDarkMode(!darkMode)}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
      </header>

      {selectedLeague && (
        <div className="context-bar">
          <button className="context-item context-item-link" onClick={() => handleSelectLeague('')}>
            <span className="context-label">League</span>
            <span className="context-value">{selectedLeague.name}</span>
            <span className="context-change">Change</span>
          </button>
          <div className="context-item">
            <span className="context-label">Format</span>
            <span className="context-value">{formatLabel(selectedLeague.format)}</span>
          </div>
          <div className="context-item">
            <span className="context-label">Players</span>
            <span className="context-value">{players.length}</span>
          </div>
          <div className="context-item">
            <span className="context-label">Courts</span>
            <span className="context-value">{courts.length}</span>
          </div>
          <div className="context-item">
            <span className="context-label">Rounds</span>
            <span className="context-value">{rounds.length}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)} className="dismiss-button">×</button>
        </div>
      )}

      {successMessage && (
        <div className="success-banner">
          {successMessage}
          <button onClick={() => setSuccessMessage(null)} className="dismiss-button">×</button>
        </div>
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner">
            <span>Loading...</span>
          </div>
        </div>
      )}

      <main>
        <DevTools
          onSeedData={handleSeedMockData}
          onClearData={handleClearAllData}
        />

        {!selectedLeagueId ? (
          <LeagueSelector
            leagues={leagues}
            selectedLeagueId={selectedLeagueId}
            onSelect={handleSelectLeague}
            onCreateLeague={handleCreateLeague}
            onDeleteLeague={handleDeleteLeague}
          />
        ) : (
          <>
            <div className="tab-nav">
              <button
                className={`tab-btn ${activeTab === 'setup' ? 'active' : ''}`}
                onClick={() => setActiveTab('setup')}
              >
                Setup
              </button>
              <button
                className={`tab-btn ${activeTab === 'rounds' ? 'active' : ''}`}
                onClick={() => setActiveTab('rounds')}
              >
                Rounds
              </button>
            </div>

            {activeTab === 'setup' && (
              <>
                {sessionMode === 'auto' && rounds.length > 0 && (
                  <div className="session-status-indicator">
                    <div className="session-status-dot" />
                    <div className="session-status-info">
                      <span className="session-status-title">Auto Session Active</span>
                      <span className="session-status-detail">
                        {isOnBreak
                          ? `Break — ${autoActiveRound ? `Round ${autoActiveRound.roundNumber}` : 'Round 1'} up next`
                          : autoActiveRound
                            ? `Round ${autoActiveRound.roundNumber} of ${rounds.length}${timerActive ? ` — ${formatTime(timeRemaining)} left` : ''}`
                            : `${rounds.length} rounds queued`
                        }
                      </span>
                    </div>
                    <button className="session-status-view" onClick={() => setActiveTab('rounds')}>View Rounds →</button>
                  </div>
                )}

                <section className="league-section">
                  <LeagueSelector
                    leagues={leagues}
                    selectedLeagueId={selectedLeagueId}
                    onSelect={handleSelectLeague}
                    onCreateLeague={handleCreateLeague}
                    compact
                  />
                </section>

                <div className="management-section">
                  <PlayerManager
                    leagueId={selectedLeagueId}
                    players={players}
                    onAddPlayer={handleAddPlayer}
                    onImportPlayers={handleImportPlayers}
                    onRemovePlayer={handleRemovePlayer}
                    nextInputId="court-input"
                  />
                  <CourtManager
                    leagueId={selectedLeagueId}
                    courts={courts}
                    onAddCourt={handleAddCourt}
                    onRemoveCourt={handleRemoveCourt}
                    inputId="court-input"
                  />
                  <div className="session-settings-card">
                    <h2>Settings</h2>

                    <div className="setting-group">
                      <label className="setting-label">Mode</label>
                      <div className="mode-options">
                        <button
                          className={`mode-option ${sessionMode === 'manual' ? 'active' : ''}`}
                          onClick={() => handleModeSwitch('manual')}
                        >Manual</button>
                        <button
                          className={`mode-option ${sessionMode === 'auto' ? 'active' : ''}`}
                          onClick={() => handleModeSwitch('auto')}
                        >Auto</button>
                      </div>
                      {pendingModeSwitch && (
                        <div className="mode-switch-warning">
                          <p>Switching to {pendingModeSwitch} mode will clear all current rounds.</p>
                          <div className="mode-switch-actions">
                            <button className="mode-switch-confirm" onClick={confirmModeSwitch}>Switch &amp; Reset</button>
                            <button className="mode-switch-cancel" onClick={() => setPendingModeSwitch(null)}>Cancel</button>
                          </div>
                        </div>
                      )}
                      <p className="setting-hint">
                        {sessionMode === 'manual'
                          ? 'You start each round'
                          : 'Rounds advance when timer ends'}
                      </p>
                    </div>

                    <div className="setting-group">
                      {sessionMode === 'manual' ? (
                        <>
                          <label className="duration-toggle">
                            <input
                              type="checkbox"
                              checked={timerEnabled}
                              onChange={(e) => setTimerEnabled(e.target.checked)}
                            />
                            <span className="setting-label">Timer</span>
                            <span className="optional-badge">optional</span>
                          </label>
                          {timerEnabled && (
                            <div className="duration-input-row">
                              <input
                                type="number"
                                min="1"
                                max="60"
                                value={roundDurationMinutes}
                                onChange={(e) => setRoundDurationMinutes(Math.max(1, Number(e.target.value)))}
                              />
                              <span className="duration-unit">min</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <label className="setting-label">Round Duration</label>
                          <div className="duration-input-row">
                            <input
                              type="number"
                              min="1"
                              max="60"
                              value={roundDurationMinutes}
                              onChange={(e) => setRoundDurationMinutes(Math.max(1, Number(e.target.value)))}
                            />
                            <span className="duration-unit">min</span>
                          </div>
                        </>
                      )}
                    </div>

                    {sessionMode === 'auto' && (
                      <div className="setting-group">
                        <label className="setting-label">Break Between Rounds</label>
                        <div className="duration-input-row">
                          <input
                            type="number"
                            min="0"
                            max="30"
                            value={breakMinutes}
                            onChange={(e) => setBreakMinutes(Math.max(0, Number(e.target.value)))}
                          />
                          <span className="duration-unit">min</span>
                        </div>
                      </div>
                    )}

                    {sessionMode === 'auto' && (
                      <div className="setting-group">
                        <label className="setting-label">Total Rounds</label>
                        <div className="duration-input-row">
                          <input
                            type="number"
                            min="1"
                            max="50"
                            value={totalRoundsPlanned}
                            onChange={(e) => setTotalRoundsPlanned(Math.max(1, Number(e.target.value)))}
                          />
                          <span className="duration-unit">rounds</span>
                        </div>
                        <p className="setting-hint">
                          Ends around {(() => {
                            const totalMin = (totalRoundsPlanned * roundDurationMinutes) + ((totalRoundsPlanned - 1) * breakMinutes);
                            const end = new Date(Date.now() + totalMin * 60000);
                            return end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                          })()}
                          {' '}({totalRoundsPlanned * roundDurationMinutes + (totalRoundsPlanned - 1) * breakMinutes} min total)
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="start-session-bar">
                  <div className="start-session-stats">
                    <span className={`stat ${players.length >= 4 ? 'ready' : ''}`}>🧍 {players.length} player{players.length !== 1 ? 's' : ''}</span>
                    <span className={`stat ${courts.length >= 1 ? 'ready' : ''}`}><CourtIcon size={16} /> {courts.length} court{courts.length !== 1 ? 's' : ''}</span>
                    <span className="stat">{timerEnabled ? `⏱ ${roundDurationMinutes}m rounds` : '⏱ No timer'}</span>
                  </div>
                  {players.length < 4 && (
                    <p className="start-session-hint">Add at least 4 players to start</p>
                  )}
                  {players.length >= 4 && courts.length < 1 && (
                    <p className="start-session-hint">Add at least 1 court to start</p>
                  )}
                  <div className="start-session-actions">
                  <button
                    className="start-session-btn"
                    disabled={players.length < 4 || courts.length < 1}
                    onClick={sessionMode === 'auto' && rounds.length === 0 ? handleStartAutoSession : () => setActiveTab('rounds')}
                  >
                    {rounds.length > 0 ? 'Go to Rounds →' : 'Start Session →'}
                  </button>
                  {rounds.length > 0 && (
                    <button
                      className="new-session-btn"
                      onClick={async () => {
                        if (!selectedLeagueId) return;
                        try {
                          await api.clearRounds(selectedLeagueId);
                          setRounds([]);
                          setAssignments([]);
                          setAutoActiveRound(null);
                          setTimerEndTime(null);
                          setIsOnBreak(false);
                          setTimerHidden(false);
                          clearSessionState(selectedLeagueId);
                          setSuccessMessage('Session reset — players and courts kept');
                        } catch (err: any) {
                          setError(err.message || 'Failed to reset session');
                        }
                      }}
                    >
                      🔄 New Session
                    </button>
                  )}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'rounds' && (
              <section className="rounds-section">
                {sessionMode === 'manual' && (
                  <RoundGenerator
                    leagueId={selectedLeagueId}
                    onGenerateRound={handleGenerateRound}
                    currentRoundCount={rounds.length}
                  />
                )}

                {sessionMode === 'auto' && rounds.length === 0 && (
                  <div className="auto-empty-state">
                    <p className="auto-empty-title">No rounds yet</p>
                    <p className="auto-empty-detail">Head back to Setup to configure and start your auto session.</p>
                    <button className="auto-empty-btn" onClick={() => setActiveTab('setup')}>
                      ← Go to Setup
                    </button>
                  </div>
                )}

                {(timerActive || timerExpired) && !timerHidden && (
                  <div className={`round-timer ${timerExpired && !isOnBreak && isLastRound ? 'expired' : isOnBreak && timerActive ? 'on-break' : timeRemaining < 60000 && timerActive ? 'warning' : ''}`}>
                    <span className="timer-display">{timerExpired ? '0:00' : formatTime(timeRemaining)}</span>
                    {isOnBreak && timerActive && <span className="timer-label">break</span>}
                    {timerExpired && !isOnBreak && isLastRound && <span className="timer-label">Time's up!</span>}
                    {timerExpired && !isOnBreak && !isLastRound && sessionMode === 'auto' && <span className="timer-label">advancing…</span>}
                    {timerActive && !isOnBreak && <span className="timer-label">remaining</span>}
                    <button className="timer-reset-btn" onClick={() => setTimerHidden(true)} title="Hide timer">👁</button>
                  </div>
                )}

                {(timerActive || timerExpired) && timerHidden && (
                  <button className="timer-show-btn" onClick={() => setTimerHidden(false)} title="Show timer">
                    ⏱ Show Timer
                  </button>
                )}
                
                {rounds.length > 0 && currentRound && (
                  <>
                    <div className="rounds-toolbar">
                      <RoundNavigator
                        currentRound={currentRound.roundNumber}
                        totalRounds={rounds.length}
                        onNavigate={handleNavigateToRound}
                        liveRound={sessionMode === 'auto' && autoActiveRound ? autoActiveRound.roundNumber : undefined}
                      />
                      <button className="tv-mode-btn" onClick={() => setTvMode(true)}>
                        📺 TV Mode
                      </button>
                    </div>
                    <RoundDisplay
                      round={currentRound}
                      assignments={assignments}
                      courts={courts}
                      players={players}
                      onUpdateAssignments={handleUpdateAssignments}
                      byeCounts={byeCounts}
                      hideByePlayers={false}
                    />
                  </>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {tvMode && currentRound && selectedLeague && (() => {
        const tvRound = sessionMode === 'auto' && autoActiveRound ? autoActiveRound : currentRound;
        const tvAssignments = sessionMode === 'auto' && autoActiveRound && autoActiveRound.id !== currentRound.id && autoActiveAssignments.length > 0
          ? autoActiveAssignments
          : assignments;
        return (
          <TVDisplay
            round={tvRound}
            assignments={tvAssignments}
            courts={courts}
            players={players}
            leagueName={selectedLeague.name}
            onExit={() => setTvMode(false)}
            timeRemaining={timeRemaining}
            timerActive={timerActive}
            timerExpired={timerExpired}
            isOnBreak={isOnBreak}
            isLastRound={isLastRound}
            formatTime={formatTime}
            nextRound={nextRound}
            nextAssignments={nextAssignments}
            timerHidden={timerHidden}
          />
        );
      })()}
    </div>
  );
}

export default App;
