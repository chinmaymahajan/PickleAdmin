import React, { useEffect, useRef, useState } from 'react';
import { Round, Assignment, Court, Player } from '../types';

/** TV Display - full-screen overlay for big screens */
interface TVDisplayProps {
  round: Round;
  assignments: Assignment[];
  courts: Court[];
  players: Player[];
  leagueName: string;
  onExit: () => void;
  timeRemaining: number;
  timerActive: boolean;
  timerExpired: boolean;
  isOnBreak: boolean;
  isLastRound: boolean;
  formatTime: (ms: number) => string;
  nextRound?: Round | null;
  nextAssignments?: Assignment[];
  timerHidden?: boolean;
}

const TVDisplay: React.FC<TVDisplayProps> = ({
  round,
  assignments,
  courts,
  players,
  leagueName,
  onExit,
  timeRemaining,
  timerActive,
  timerExpired,
  isOnBreak,
  isLastRound,
  formatTime,
  nextRound,
  nextAssignments = [],
  timerHidden = false
}) => {
  const getPlayerName = (id: string) => players.find(p => p.id === id)?.name ?? '?';
  const getCourtName = (id: string) => courts.find(c => c.id === id)?.identifier ?? '?';

  // Escape key exits TV mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit]);

  // During break, show next round info if available
  const displayRound = isOnBreak && nextRound ? nextRound : round;
  const displayAssignments = isOnBreak && nextRound && nextAssignments.length > 0 ? nextAssignments : assignments;

  // Track round changes for animation
  const [animating, setAnimating] = useState(false);
  const prevRoundRef = useRef(displayRound.roundNumber);
  useEffect(() => {
    if (displayRound.roundNumber !== prevRoundRef.current) {
      prevRoundRef.current = displayRound.roundNumber;
      setAnimating(true);
      const t = setTimeout(() => setAnimating(false), 700);
      return () => clearTimeout(t);
    }
  }, [displayRound.roundNumber]);

  const sorted = [...displayAssignments].sort((a, b) =>
    getCourtName(a.courtId).localeCompare(getCourtName(b.courtId))
  );

  const assignedIds = new Set<string>();
  displayAssignments.forEach(a => {
    a.team1PlayerIds.forEach(id => assignedIds.add(id));
    a.team2PlayerIds.forEach(id => assignedIds.add(id));
  });
  const waiting = players.filter(p => !assignedIds.has(p.id));

  const isWarning = timerActive && timeRemaining < 60000;

  // Pick column count and density class based on court count
  const courtCount = sorted.length;
  const tvCols = courtCount <= 2 ? courtCount : courtCount <= 4 ? 2 : courtCount <= 6 ? 3 : 4;
  const densityClass = courtCount > 6 ? 'tv-dense' : courtCount > 4 ? 'tv-compact' : '';

  return (
    <div className="tv-overlay" onClick={onExit}>
      <div className={`tv-content ${densityClass} ${animating ? 'tv-round-enter' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="tv-header">
          <span className="tv-league">{leagueName}</span>
          <span className="tv-round">
            {isOnBreak && nextRound ? `Up Next — Round ${displayRound.roundNumber}` : `Round ${displayRound.roundNumber}`}
          </span>
          <button className="tv-exit" onClick={onExit} aria-label="Exit TV mode">✕</button>
        </div>

        <div className="tv-courts" style={{ '--tv-cols': tvCols } as React.CSSProperties}>
          {sorted.map(a => (
            <div key={a.id} className="tv-court">
              <div className="tv-court-name">{getCourtName(a.courtId)}</div>
              <div className="tv-matchup">
                <div className="tv-team">
                  {a.team1PlayerIds.map(id => getPlayerName(id)).join(' + ')}
                </div>
                <div className="tv-vs-divider">
                  <span className="tv-vs-line" />
                  <span className="tv-vs">VS</span>
                  <span className="tv-vs-line" />
                </div>
                <div className="tv-team">
                  {a.team2PlayerIds.map(id => getPlayerName(id)).join(' + ')}
                </div>
              </div>
            </div>
          ))}
        </div>

        {waiting.length > 0 && (
          <div className="tv-waiting">
            <span className="tv-waiting-label">🪑 Next In Line</span>
            <span className="tv-waiting-names">{waiting.map(p => p.name).join('  •  ')}</span>
          </div>
        )}
      </div>

      {!timerHidden && (timerActive || (timerExpired && isLastRound)) && (
        <div className={`tv-timer-floating ${timerExpired && !isOnBreak && isLastRound ? 'expired' : isOnBreak ? 'on-break' : isWarning ? 'warning' : ''}`}>
          {isOnBreak && timerActive ? `BREAK ${formatTime(timeRemaining)}` : timerExpired && isLastRound ? "TIME'S UP" : timerActive ? formatTime(timeRemaining) : ''}
        </div>
      )}
    </div>
  );
};

export default TVDisplay;
