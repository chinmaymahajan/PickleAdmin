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
import PickleballIcon from './components/PickleballIcon';
import { playBuzzer, suppressBuzzerFor } from './utils/sound';
import log from './utils/logger';

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
  const sessionModeRef = useRef(sessionMode);
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
    localStorage.removeItem(`manualTimerEndTime_${leagueId}`);
    localStorage.removeItem(`manualActiveTab_${leagueId}`);
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
      api.getAssignments(firstRound.id).then(setNextAssignments).catch((err) => { log.app.warn('Failed to prefetch assignments', err); setNextAssignments([]); });
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
      api.getAssignments(upcoming.id).then(setNextAssignments).catch((err) => { log.app.warn('Failed to prefetch assignments', err); setNextAssignments([]); });
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
    api.getAssignments(autoActiveRound.id).then(setAutoActiveAssignments).catch((err) => { log.app.warn('Failed to prefetch auto-active assignments', err); setAutoActiveAssignments([]); });
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

  // Persist manual-mode timer so it survives page refresh.
  // Skip during initial load so we don't wipe the saved value before
  // loadLeagueData has a chance to restore it.
  useEffect(() => {
    if (!initialLoadDone.current) return;
    if (sessionMode === 'manual' && selectedLeagueId) {
      if (timerEndTime !== null) {
        localStorage.setItem(`manualTimerEndTime_${selectedLeagueId}`, String(timerEndTime));
      } else {
        localStorage.removeItem(`manualTimerEndTime_${selectedLeagueId}`);
      }
    }
  }, [timerEndTime, sessionMode, selectedLeagueId]);

  // Persist activeTab for manual mode so the rounds view is restored after refresh
  useEffect(() => {
    if (!initialLoadDone.current) return;
    if (sessionMode === 'manual' && selectedLeagueId) {
      localStorage.setItem(`manualActiveTab_${selectedLeagueId}`, activeTab);
    }
  }, [activeTab, sessionMode, selectedLeagueId]);

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

  // Ref: has the manual-mode buzzer already fired for the current timer?
  // Initialised to true so no buzzer fires before a timer has ever started.
  const manualBuzzerFiredRef = useRef(true);
  // Ref: timestamp when the current timer was started (used to reject
  // false expirations that happen within the first few seconds).
  const timerStartedAtRef = useRef(0);

  // --- Core auto-advance logic (extracted so it can be called from both
  // the React effect AND the interval tick) ---
  // When the tab is backgrounded, multiple timer periods may have elapsed.
  // This function loops through all elapsed breaks/rounds until it reaches
  // a timer that is still in the future, or runs out of rounds.
  //
  // Guard: we track the timerEndTime value that was last handled. If the
  // current timerEndTime matches, we skip (already handled). This is more
  // robust than a boolean flag because it doesn't require a separate reset
  // mechanism that can get out of sync with React's effect ordering.
  const lastHandledTimerRef = useRef<number | null>(null);

  const handleAutoAdvance = useCallback(() => {
    if (sessionModeRef.current !== 'auto' || !selectedLeagueId) return;
    if (isRestoringSession.current) return;
    if (suppressAdvanceRef.current) {
      suppressAdvanceRef.current = false;
      return;
    }

    const curTimerEnd = timerEndTimeRef.current;
    if (curTimerEnd === null) return;
    // Already handled this exact timer expiration
    if (lastHandledTimerRef.current === curTimerEnd) return;
    lastHandledTimerRef.current = curTimerEnd;

    log.round.info('handleAutoAdvance — processing timer expiry, timerEndTime:', curTimerEnd);

    const curRounds = roundsRef.current;
    // Mutable copies so we can fast-forward through multiple elapsed periods
    let simOnBreak = isOnBreakRef.current;
    let simAutoActive = autoActiveRoundRef.current;
    let simTimerEnd: number | null = null;
    let buzzerPlayed = false;
    // Track whether the session reached its natural end (last round done)
    let sessionComplete = false;

    // Loop: keep advancing until the next timer hasn't expired yet or we're done
    const MAX_ITERATIONS = curRounds.length * 2 + 2; // safety cap
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      if (simOnBreak) {
        // Break just ended — start the next round
        let targetRound: Round | undefined;
        if (!simAutoActive) {
          targetRound = curRounds.length > 0 ? curRounds[0] : undefined;
        } else {
          const idx = curRounds.findIndex(r => r.id === simAutoActive!.id);
          targetRound = idx >= 0 && idx < curRounds.length - 1
            ? curRounds[idx + 1]
            : undefined;
        }
        if (!targetRound) {
          // No more rounds — stop
          simOnBreak = false;
          break;
        }
        console.log(`[AUTO] Round ${targetRound.roundNumber} starting (${roundDurationMinutes}m)`);
        log.round.info(`Round ${targetRound.roundNumber} in progress out of ${curRounds.length} — starting after break (${roundDurationMinutes}m)`);
        simOnBreak = false;
        simAutoActive = targetRound;
        const dur = roundDurationMinutes * 60 * 1000;
        simTimerEnd = Date.now() + dur;
        // If this timer is still in the future, we're done fast-forwarding
        if (simTimerEnd > Date.now()) break;
      } else {
        // Round just ended
        if (!buzzerPlayed) { playBuzzer(); buzzerPlayed = true; }
        if (!simAutoActive) break;
        const idx = curRounds.findIndex(r => r.id === simAutoActive!.id);
        const nextAutoRound = idx >= 0 && idx < curRounds.length - 1
          ? curRounds[idx + 1]
          : undefined;
        if (!nextAutoRound) {
          // Last round finished — no more to advance; keep timer expired for "Time's up!" UI
          sessionComplete = true;
          break;
        }
        if (breakMinutes > 0) {
          console.log(`[AUTO] Break starting (${breakMinutes}m) — Round ${nextAutoRound.roundNumber} up next`);
          log.round.info(`Break starting (${breakMinutes}m) — Round ${nextAutoRound.roundNumber} of ${curRounds.length} up next`);
          simOnBreak = true;
          const bDur = breakMinutes * 60 * 1000;
          simTimerEnd = Date.now() + bDur;
          if (simTimerEnd > Date.now()) break;
        } else {
          console.log(`[AUTO] Round ${nextAutoRound.roundNumber} starting (${roundDurationMinutes}m, no break)`);
          log.round.info(`Round ${nextAutoRound.roundNumber} in progress out of ${curRounds.length} — starting (${roundDurationMinutes}m, no break)`);
          simAutoActive = nextAutoRound;
          const dur = roundDurationMinutes * 60 * 1000;
          simTimerEnd = Date.now() + dur;
          if (simTimerEnd > Date.now()) break;
        }
      }
    }

    // Apply the final state all at once
    // Update refs immediately so any re-entrant calls see the right values
    isOnBreakRef.current = simOnBreak;
    autoActiveRoundRef.current = simAutoActive;
    setIsOnBreak(simOnBreak);
    setAutoActiveRound(simAutoActive);
    if (simAutoActive) {
      setCurrentRound(simAutoActive);
    }
    if (sessionComplete) {
      // Session finished — leave timer in expired state so UI shows "Time's up!"
      // Don't touch timerEndTime; timeRemaining is already 0 from the tick.
    } else if (simTimerEnd !== null) {
      const remaining = Math.max(0, simTimerEnd - Date.now());
      // Update the ref immediately so the guard works for re-entrant calls
      timerEndTimeRef.current = simTimerEnd;
      setTimerEndTime(simTimerEnd);
      setTimeRemaining(remaining);
    } else {
      timerEndTimeRef.current = null;
      setTimerEndTime(null);
      setTimeRemaining(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeagueId, roundDurationMinutes, breakMinutes]);

  // Countdown timer tick — only handles the countdown display and manual buzzer.
  // Auto-advance is handled by a separate effect watching timerExpired.
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
        // Manual-mode buzzer
        if (
          sessionModeRef.current === 'manual' &&
          !manualBuzzerFiredRef.current &&
          Date.now() - timerStartedAtRef.current >= 5000
        ) {
          manualBuzzerFiredRef.current = true;
          log.timer.info('Manual timer expired — buzzer fired');
          playBuzzer();
        }
        // Auto-mode: call advance directly from the tick as a fallback.
        // This ensures advance happens even if the React effect chain
        // doesn't fire (e.g. background tab, batched renders).
        if (sessionModeRef.current === 'auto') {
          handleAutoAdvance();
        }
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [timerEndTime, handleAutoAdvance]);

  const startTimer = useCallback(() => {
    if (timerEnabled && roundDurationMinutes > 0) {
      log.timer.info('Timer started —', roundDurationMinutes, 'min, mode:', sessionMode === 'auto' ? 'auto' : 'manual');
      const duration = roundDurationMinutes * 60 * 1000;
      setTimerEndTime(Date.now() + duration);
      setTimeRemaining(duration);
      setTimerHidden(false);
      timerStartedAtRef.current = Date.now();
      manualBuzzerFiredRef.current = false;
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
  const timerEndTimeRef = useRef(timerEndTime);

  // Keep refs in sync
  useEffect(() => { isOnBreakRef.current = isOnBreak; }, [isOnBreak]);
  useEffect(() => { autoActiveRoundRef.current = autoActiveRound; }, [autoActiveRound]);
  useEffect(() => { roundsRef.current = rounds; }, [rounds]);
  useEffect(() => { sessionModeRef.current = sessionMode; }, [sessionMode]);
  useEffect(() => { timerEndTimeRef.current = timerEndTime; }, [timerEndTime]);

  // Reset handled flag whenever a new timer starts
  useEffect(() => {
    if (timerActive) {
      timerHandledRef.current = false;
    }
  }, [timerActive]);

  // Auto-advance: when timer expires in auto mode, start break then next round.
  // This effect handles the normal (tab-focused) case. The interval tick
  // also calls handleAutoAdvance as a fallback.
  useEffect(() => {
    if (!timerExpired) return;
    handleAutoAdvance();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerExpired]);

  // When the tab becomes visible again, check if the timer expired while
  // backgrounded and catch up immediately.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (timerEndTime === null) return;
      const remaining = timerEndTime - Date.now();
      if (remaining <= 0) {
        log.timer.info('Tab became visible — timer expired while backgrounded, catching up');
        setTimeRemaining(0);
        handleAutoAdvance();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [timerEndTime, handleAutoAdvance]);

  // (Manual-mode buzzer is now handled directly inside the countdown
  // interval tick above — no React effect needed.)

  const selectedLeague = leagues.find(l => l.id === selectedLeagueId);
  const timerRound = sessionMode === 'auto' && autoActiveRound ? autoActiveRound : currentRound;
  const isLastRound = timerRound
    ? rounds.findIndex(r => r.id === timerRound.id) === rounds.length - 1
    : true;

  const loadLeagues = async () => {
    log.app.info('Loading leagues…');
    try {
      const data = await api.listLeagues();
      setLeagues(data);
      log.app.info('Leagues loaded —', data.length, 'leagues');
    }
    catch (err: any) {
      log.app.error('Failed to load leagues', err);
      setError(err.message || 'Failed to load leagues');
    }
  };

  const loadLeagueData = async (leagueId: string) => {
    log.app.info('loadLeagueData — league', leagueId);
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
        log.app.info('Restoring auto session state — activeRound:', cached.autoActiveRound?.roundNumber ?? 'none', 'isOnBreak:', cached.isOnBreak, 'timerEndTime:', cached.timerEndTime);
        suppressAdvanceRef.current = true; // Prevent auto-advance from firing on restored expired timer
        if (cached.timerEndTime !== null && cached.timerEndTime <= Date.now()) {
          setAutoActiveRound(cached.autoActiveRound);
          setTimerEndTime(null);
          setIsOnBreak(cached.isOnBreak);
        } else {
          setAutoActiveRound(cached.autoActiveRound);
          setTimerEndTime(cached.timerEndTime);
          setTimeRemaining(cached.timerEndTime !== null ? Math.max(0, cached.timerEndTime - Date.now()) : 0);
          setIsOnBreak(cached.isOnBreak);
        }
        setTimerHidden(cached.timerHidden);
        setActiveTab(cached.activeTab);
        setCurrentRound(cached.autoActiveRound || roundsData[roundsData.length - 1]);
      } else {
        log.app.info('No cached session state — using defaults for league', leagueId);
        // No cached state — reset to defaults
        setAutoActiveRound(null);
        setIsOnBreak(false);
        setTimerHidden(false);

        // Restore manual-mode timer if it was running before refresh
        if (sessionMode === 'manual') {
          const savedEnd = localStorage.getItem(`manualTimerEndTime_${leagueId}`);
          if (savedEnd) {
            const endTime = Number(savedEnd);
            const remaining = endTime - Date.now();
            if (remaining > 0) {
              // Timer still running — restore it and allow buzzer to fire
              manualBuzzerFiredRef.current = false;
              timerStartedAtRef.current = endTime - roundDurationMinutes * 60 * 1000;
              setTimerEndTime(endTime);
              setTimeRemaining(remaining);
            } else {
              // Timer expired while away — fire the buzzer now, then clear
              localStorage.removeItem(`manualTimerEndTime_${leagueId}`);
              setTimerEndTime(null);
              setTimeRemaining(0);
              log.timer.info('Manual timer expired while away — buzzer fired on restore');
              playBuzzer();
            }
          } else {
            setTimerEndTime(null);
          }
          // Restore active tab
          const savedTab = localStorage.getItem(`manualActiveTab_${leagueId}`);
          if (savedTab === 'rounds' || savedTab === 'setup') {
            setActiveTab(savedTab);
          }
        } else {
          setTimerEndTime(null);
        }

        if (roundsData.length > 0) {
          setCurrentRound(roundsData[roundsData.length - 1]);
        } else {
          setCurrentRound(null);
          setAssignments([]);
        }
      }
    } catch (err: any) {
      log.app.error('Failed to load league data', err);
      setError(err.message || 'Failed to load league data');
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
      isRestoringSession.current = false;
      log.app.info('loadLeagueData complete — league', leagueId);
    }
  };

  const loadAssignments = async (roundId: string) => {
    try {
      const data = await api.getAssignments(roundId);
      setAssignments(data);
      log.app.debug('Assignments loaded — round', roundId, data.length, 'assignments');
      if (selectedLeagueId) {
        setByeCounts(await api.getByeCounts(selectedLeagueId));
      }
    }
    catch (err: any) {
      log.app.error('Failed to load assignments for round', roundId, err);
      setError(err.message || 'Failed to load assignments');
    }
  };

  const handleSelectLeague = async (leagueId: string) => {
    log.app.info('handleSelectLeague —', leagueId || '(deselect)');
    setError(null);
    setSuccessMessage(null);
    setTvMode(false);

    // Stop the interval tick (it will be re-created when timerEndTime is restored).
    // We do NOT suppress the buzzer here — the timer should survive navigation
    // and fire the buzzer when the user returns.
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    // Save current league's session state before switching
    if (selectedLeagueId) {
      log.app.debug('Saving session state for league', selectedLeagueId, 'before switch');
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
      // Don't clear timerEndTime for manual mode — it's persisted in localStorage
      // and will be restored (with buzzer) when the user returns.
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
    } catch (err: any) {
      log.app.error('Failed to select league', err);
      setError(err.message || 'Failed to select league');
    }
  };

  const handleCreateLeague = async (name: string, format: LeagueFormat) => {
    log.app.info('handleCreateLeague —', name, format);
    setError(null);
    setSuccessMessage(null);
    try {
      const league = await api.createLeague(name, format);
      setLeagues([...leagues, league]);
      setSuccessMessage(`League "${name}" created`);
      log.app.info('League created successfully —', league.id);
      setActiveTab('setup');
      setSelectedLeagueId(league.id);
    } catch (err: any) {
      log.app.error('Failed to create league', err);
      setError(err.message || 'Failed to create league');
      throw err;
    }
  };

  const handleDeleteLeague = async (leagueId: string) => {
    log.app.info('handleDeleteLeague —', leagueId);
    setError(null);
    try {
      await api.deleteLeague(leagueId);
      leagueSessionCache.current.delete(leagueId);
      clearSessionState(leagueId);
      setLeagues(leagues.filter(l => l.id !== leagueId));
      if (selectedLeagueId === leagueId) {
        // Stop any running timer immediately so the buzzer cannot fire after deletion
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        manualBuzzerFiredRef.current = true;
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
      log.app.error('Failed to delete session', err);
      setError(err.message || 'Failed to delete session');
      throw err;
    }
  };

  const regenerateIfAutoSession = async () => {
    if (sessionMode !== 'auto' || !selectedLeagueId || !autoActiveRound || rounds.length === 0) {
      log.app.debug('regenerateIfAutoSession — skipped (mode:', sessionMode, 'activeRound:', autoActiveRound?.roundNumber ?? 'none', 'rounds:', rounds.length, ')');
      return;
    }
    log.app.info('regenerateIfAutoSession — regenerating future rounds after round', autoActiveRound.roundNumber, 'of', rounds.length);
    try {
      const updatedRounds = await api.regenerateFutureRounds(selectedLeagueId, autoActiveRound.roundNumber);
      setRounds(updatedRounds);
      setSuccessMessage('Future rounds regenerated with updated roster');
    } catch (err: any) {
      log.app.error('Failed to regenerate future rounds', err);
      setError(err.message || 'Failed to regenerate future rounds');
    }
  };

  const handleAddPlayer = async (name: string) => {
    if (!selectedLeagueId) return;
    log.app.info('handleAddPlayer —', name);
    setError(null);
    setSuccessMessage(null);
    try {
      const player = await api.addPlayer(selectedLeagueId, name);
      setPlayers([...players, player]);
      setSuccessMessage(`${name} added`);
      await regenerateIfAutoSession();
    } catch (err: any) {
      log.player.error('Failed to add player', err);
      setError(err.message || 'Failed to add player');
      throw err;
    }
  };

  const handleImportPlayers = async (names: string[]) => {
    if (!selectedLeagueId) return;
    log.app.info('handleImportPlayers —', names.length, 'names to import');
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
    log.app.info('Import complete —', added.length, 'of', names.length, 'players added');
    setSuccessMessage(`${added.length} player${added.length !== 1 ? 's' : ''} imported`);
    await regenerateIfAutoSession();
  };

  const handleAddCourt = async (identifier: string) => {
    if (!selectedLeagueId) return;
    log.app.info('handleAddCourt —', identifier);
    setError(null);
    setSuccessMessage(null);
    try {
      const court = await api.addCourt(selectedLeagueId, identifier);
      setCourts([...courts, court]);
      setSuccessMessage(`${identifier} added`);
      await regenerateIfAutoSession();
    } catch (err: any) {
      log.court.error('Failed to add court', err);
      setError(err.message || 'Failed to add court');
      throw err;
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    log.app.info('handleRemovePlayer —', playerId);
    setError(null);
    try {
      await api.deletePlayer(playerId);
      setPlayers(players.filter(p => p.id !== playerId));
      setSuccessMessage('Player removed');
      await regenerateIfAutoSession();
    } catch (err: any) {
      log.player.error('Failed to remove player', err);
      setError(err.message || 'Failed to remove player');
    }
  };

  const handleRemoveCourt = async (courtId: string) => {
    log.app.info('handleRemoveCourt —', courtId);
    setError(null);
    try {
      await api.deleteCourt(courtId);
      setCourts(courts.filter(c => c.id !== courtId));
      setSuccessMessage('Court removed');
      await regenerateIfAutoSession();
    } catch (err: any) {
      log.court.error('Failed to remove court', err);
      setError(err.message || 'Failed to remove court');
    }
  };

  const handleGenerateRound = async () => {
    if (!selectedLeagueId) return;
    log.round.info('handleGenerateRound — generating round', rounds.length + 1);
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    // Suppress any buzzer sound for 10 seconds — prevents phantom horn
    // triggers caused by React state transitions when starting a round.
    suppressBuzzerFor(10000);
    try {
      const round = await api.generateRound(selectedLeagueId);
      const newRounds = [...rounds, round];
      setRounds(newRounds);
      setCurrentRound(round);
      setActiveTab('rounds');
      startTimer();
      log.round.info(`Round ${round.roundNumber} in progress out of ${newRounds.length} total`);
      setSuccessMessage(`Round ${round.roundNumber} generated`);
    } catch (err: any) {
      log.round.error('Failed to generate round', err);
      setError(err.message || 'Failed to generate round');
      throw err;
    } finally { setLoading(false); }
  };

  const handleStartAutoSession = async () => {
    if (!selectedLeagueId) return;
    log.round.info('handleStartAutoSession — generating', totalRoundsPlanned, 'rounds, duration:', roundDurationMinutes, 'min, break:', breakMinutes, 'min');
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    suppressBuzzerFor(10000);
    lastHandledTimerRef.current = null;
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
        console.log(`[AUTO] Initial break starting (${breakMinutes}m) — Round 1 up next`);
        const breakDuration = breakMinutes * 60 * 1000;
        setTimerEndTime(Date.now() + breakDuration);
        setTimeRemaining(breakDuration);
      } else {
        // No break configured — start Round 1 immediately
        console.log(`[AUTO] Round 1 starting immediately (${roundDurationMinutes}m, no break)`);
        setAutoActiveRound(firstAutoRound);
        const roundDuration = roundDurationMinutes * 60 * 1000;
        setTimerEndTime(Date.now() + roundDuration);
        setTimeRemaining(roundDuration);
        setIsOnBreak(false);
      }
      setSuccessMessage(`${totalRoundsPlanned} rounds generated — session starting`);
      log.round.info(`Auto session started — Round 1 in progress out of ${totalRoundsPlanned}`);
    } catch (err: any) {
      log.round.error('Failed to start auto session', err);
      setError(err.message || 'Failed to start auto session');
    } finally { setLoading(false); }
  };

  const handleNavigateToRound = (roundNumber: number) => {
    log.round.debug('Navigate to round', roundNumber, 'of', rounds.length);
    const round = rounds.find(r => r.roundNumber === roundNumber);
    if (round) setCurrentRound(round);
  };

  const handleUpdateAssignments = async (updates: Array<{
    courtId: string;
    team1PlayerIds: string[];
    team2PlayerIds: string[];
  }>) => {
    if (!currentRound) return;
    log.app.info('handleUpdateAssignments — round', currentRound.roundNumber, 'of', rounds.length, '—', updates.length, 'courts');
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      const updatedAssignments = await api.updateAssignments(currentRound.id, updates);
      setAssignments(updatedAssignments);
      setSuccessMessage('Assignments saved');
    } catch (err: any) {
      log.app.error('Failed to update assignments', err);
      setError(err.message || 'Failed to update assignments');
      throw err;
    } finally { setLoading(false); }
  };

  const handleSeedMockData = async () => {
    log.dev.info('handleSeedMockData — seeding mock data');
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
    log.dev.warn('handleClearAllData — clearing all data');
    // Stop any running timer immediately so the buzzer cannot fire after data is gone
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    manualBuzzerFiredRef.current = true;
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
      setTimerEndTime(null);
      setIsOnBreak(false);
      setPendingModeSwitch(null);
      setSuccessMessage('All data cleared');
    } catch (err: any) {
      log.app.error('Failed to clear data', err);
      setError(err.message || 'Failed to clear data');
    } finally { setLoading(false); }
  };

  const formatLabel = (f: string) => f === 'round_robin' ? 'Round Robin' : f;

  const handleModeSwitch = (newMode: 'manual' | 'auto') => {
    if (newMode === sessionMode) return;
    log.app.info('handleModeSwitch —', sessionMode, '→', newMode, rounds.length > 0 ? '(has rounds, needs confirmation)' : '');
    if (rounds.length > 0) {
      setPendingModeSwitch(newMode);
    } else {
      setSessionMode(newMode);
    }
  };

  const confirmModeSwitch = async () => {
    if (!pendingModeSwitch || !selectedLeagueId) return;
    log.app.info('confirmModeSwitch — switching to', pendingModeSwitch, '(clearing rounds)');
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
      lastHandledTimerRef.current = null;
      setSuccessMessage(`Switched to ${pendingModeSwitch} mode — session reset`);
    } catch (err: any) {
      log.app.error('Failed to switch mode', err);
      setError(err.message || 'Failed to switch mode');
    }
  };



  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      <header>
        <h1><PickleballIcon size={28} /> Pickle Admin</h1>
        <button
          className="theme-toggle"
          onClick={() => setDarkMode(!darkMode)}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
        {/* TODO: Remove after Sentry confirms first error */}
        <button
          style={{ marginLeft: 8, fontSize: 12, padding: '4px 8px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          onClick={() => { throw new Error('Sentry test error!'); }}
        >
          🐛 Test Sentry
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
                          lastHandledTimerRef.current = null;
                          clearSessionState(selectedLeagueId);
                          setSuccessMessage('Session reset — players and courts kept');
                        } catch (err: any) {
                          log.app.error('Failed to reset session', err);
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
