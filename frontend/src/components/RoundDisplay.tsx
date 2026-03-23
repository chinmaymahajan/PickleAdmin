import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Round, Assignment, Court, Player } from '../types';
import { DragData, DropTarget } from './dragTypes';
import DraggablePlayerSlot from './DraggablePlayerSlot';
import DraggableBenchPlayer from './DraggableBenchPlayer';
import log from '../utils/logger';

interface RoundDisplayProps {
  round: Round | null;
  assignments: Assignment[];
  courts: Court[];
  players: Player[];
  onUpdateAssignments?: (assignments: Array<{
    courtId: string;
    team1PlayerIds: string[];
    team2PlayerIds: string[];
  }>) => Promise<void>;
  onUpdateScores?: (scores: Array<{
    courtId: string;
    team1Score: number;
    team2Score: number;
  }>) => Promise<void>;
  byeCounts?: Record<string, number>;
  hideByePlayers?: boolean;
  isManualMode?: boolean;
}

/**
 * RoundDisplay Component
 *
 * Displays court assignments with inline typeahead editing.
 * Warnings appear inline on the court where the conflict exists.
 * Conflicting players are highlighted in red. Save is blocked until resolved.
 */
const RoundDisplay: React.FC<RoundDisplayProps> = ({
  round,
  assignments,
  courts,
  players,
  onUpdateAssignments,
  onUpdateScores,
  byeCounts = {},
  hideByePlayers = false,
  isManualMode = false
}) => {
  const [editedAssignments, setEditedAssignments] = useState<Assignment[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [dragData, setDragData] = useState<DragData | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [localScores, setLocalScores] = useState<Record<string, { team1: string; team2: string }>>({});

  useEffect(() => {
    setEditedAssignments(JSON.parse(JSON.stringify(assignments)));
    setHasUnsavedChanges(false);
    // Initialize local scores from saved assignment scores
    const scores: Record<string, { team1: string; team2: string }> = {};
    for (const a of assignments) {
      scores[a.courtId] = {
        team1: a.team1Score != null ? String(a.team1Score) : '',
        team2: a.team2Score != null ? String(a.team2Score) : '',
      };
    }
    setLocalScores(scores);
  }, [assignments]);

  const handleDragStart = useCallback((data: DragData) => {
    setDragData(data);
  }, []);

  const handleDragOverSlot = useCallback((assignmentId: string, team: 'team1' | 'team2', index: number) => {
    setDropTarget(prev => {
      if (prev && prev.assignmentId === assignmentId && prev.team === team && prev.index === index) {
        return prev;
      }
      return { assignmentId, team, index };
    });
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragData(null);
    setDropTarget(null);
  }, []);

  if (!round) {
    return <div className="round-display"><p>No round to display</p></div>;
  }

  const getPlayerName = (playerId: string): string => {
    const player = players.find(p => p.id === playerId);
    return player ? player.name : 'Unknown Player';
  };

  const getCourtIdentifier = (courtId: string): string => {
    const court = courts.find(c => c.id === courtId);
    return court ? court.identifier : 'Unknown Court';
  };

  // --- Conflict detection ---
  // Build a map: playerId -> list of locations where they appear
  const playerLocationMap = new Map<string, Array<{ courtId: string; team: string }>>();
  for (const a of editedAssignments) {
    const courtName = getCourtIdentifier(a.courtId);
    for (const pid of a.team1PlayerIds) {
      if (!playerLocationMap.has(pid)) playerLocationMap.set(pid, []);
      playerLocationMap.get(pid)!.push({ courtId: a.courtId, team: `${courtName} - Team 1` });
    }
    for (const pid of a.team2PlayerIds) {
      if (!playerLocationMap.has(pid)) playerLocationMap.set(pid, []);
      playerLocationMap.get(pid)!.push({ courtId: a.courtId, team: `${courtName} - Team 2` });
    }
  }

  // Players assigned to more than one spot
  const duplicatePlayerIds = new Set<string>();
  playerLocationMap.forEach((locations, pid) => {
    if (locations.length > 1) duplicatePlayerIds.add(pid);
  });

  if (duplicatePlayerIds.size > 0) {
    log.display.warn('Conflict detected —', duplicatePlayerIds.size, 'player(s) assigned to multiple courts');
  }

  // Per-court warnings
  const courtWarnings = new Map<string, string[]>();
  for (const a of editedAssignments) {
    const warnings: string[] = [];
    const allIds = [...a.team1PlayerIds, ...a.team2PlayerIds];
    for (const pid of allIds) {
      const locations = playerLocationMap.get(pid);
      if (locations && locations.length > 1) {
        const otherLocations = locations
          .filter(l => l.courtId !== a.courtId)
          .map(l => l.team);
        if (otherLocations.length > 0) {
          warnings.push(`${getPlayerName(pid)} is also on ${otherLocations.join(', ')}`);
        }
      }
    }
    if (warnings.length > 0) {
      courtWarnings.set(a.courtId, [...new Set(warnings)]);
    }
  }

  // Players who were originally assigned but are now on bye
  const originalAssignedIds = new Set<string>();
  assignments.forEach(a => {
    a.team1PlayerIds.forEach(id => originalAssignedIds.add(id));
    a.team2PlayerIds.forEach(id => originalAssignedIds.add(id));
  });

  const hasConflicts = duplicatePlayerIds.size > 0;

  const sortedAssignments = [...editedAssignments].sort((a, b) =>
    getCourtIdentifier(a.courtId).localeCompare(getCourtIdentifier(b.courtId))
  );

  const getPlayersOnBye = (currentAssignments: Assignment[]) => {
    const assignedPlayerIds = new Set<string>();
    currentAssignments.forEach(a => {
      a.team1PlayerIds.forEach(id => assignedPlayerIds.add(id));
      a.team2PlayerIds.forEach(id => assignedPlayerIds.add(id));
    });
    return players.filter(p => !assignedPlayerIds.has(p.id));
  };

  const playersOnBye = getPlayersOnBye(editedAssignments);

  // Players newly moved to bye
  const newByePlayerNames = playersOnBye
    .filter(p => originalAssignedIds.has(p.id))
    .map(p => p.name);

  const handlePlayerChange = (
    assignmentId: string,
    team: 'team1' | 'team2',
    playerIndex: number,
    newPlayerId: string
  ) => {
    const assignment = editedAssignments.find(a => a.id === assignmentId);
    if (!assignment) return;

    const teamKey = team === 'team1' ? 'team1PlayerIds' : 'team2PlayerIds';
    const oldPlayerId = assignment[teamKey][playerIndex];
    if (oldPlayerId === newPlayerId) return;

    const newAssignments = editedAssignments.map(a => {
      if (a.id !== assignmentId) return a;
      const newTeam = [...a[teamKey]];
      newTeam[playerIndex] = newPlayerId;
      return { ...a, [teamKey]: newTeam };
    });

    setEditedAssignments(newAssignments);
    setHasUnsavedChanges(true);
  };

  const handleDrop = (
    targetAssignmentId: string,
    targetTeam: 'team1' | 'team2',
    targetIndex: number
  ) => {
    if (isSaving || !dragData) return;

    const targetTeamKey = targetTeam === 'team1' ? 'team1PlayerIds' : 'team2PlayerIds';

    if (dragData.source.type === 'bench') {
      // Bench → Court slot: replace target slot player with bench player
      const newAssignments = editedAssignments.map(a => {
        if (a.id !== targetAssignmentId) return a;
        const newTeam = [...a[targetTeamKey]];
        newTeam[targetIndex] = dragData.playerId;
        return { ...a, [targetTeamKey]: newTeam };
      });
      setEditedAssignments(newAssignments);
      setHasUnsavedChanges(true);
    } else {
      // Court → Court: swap if different slot
      const src = dragData.source;
      if (
        src.assignmentId === targetAssignmentId &&
        src.team === targetTeam &&
        src.index === targetIndex
      ) {
        // Same slot — no-op
        setDragData(null);
        setDropTarget(null);
        return;
      }

      const srcTeamKey = src.team === 'team1' ? 'team1PlayerIds' : 'team2PlayerIds';
      const targetAssignment = editedAssignments.find(a => a.id === targetAssignmentId);
      if (!targetAssignment) return;
      const targetPlayerId = targetAssignment[targetTeamKey][targetIndex];

      const newAssignments = editedAssignments.map(a => {
        let updated = a;
        // Place target player into source slot
        if (a.id === src.assignmentId) {
          const newTeam = [...a[srcTeamKey]];
          newTeam[src.index] = targetPlayerId;
          updated = { ...updated, [srcTeamKey]: newTeam };
        }
        // Place source player into target slot
        if (updated.id === targetAssignmentId) {
          const newTeam = [...updated[targetTeamKey]];
          newTeam[targetIndex] = dragData.playerId;
          updated = { ...updated, [targetTeamKey]: newTeam };
        }
        return updated;
      });
      setEditedAssignments(newAssignments);
      setHasUnsavedChanges(true);
    }

    setDragData(null);
    setDropTarget(null);
  };

  const handleSave = async () => {
    if (!onUpdateAssignments || !hasUnsavedChanges || hasConflicts) return;

    setIsSaving(true);
    try {
      const updates = editedAssignments.map(a => ({
        courtId: a.courtId,
        team1PlayerIds: a.team1PlayerIds,
        team2PlayerIds: a.team2PlayerIds
      }));
      await onUpdateAssignments(updates);
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Failed to save assignments:', err);
      log.display.error('Failed to save assignments', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setEditedAssignments(JSON.parse(JSON.stringify(assignments)));
    setHasUnsavedChanges(false);
  };

  const handleScoreChange = (courtId: string, team: 'team1' | 'team2', value: string) => {
    // Allow empty string or non-negative integers
    if (value !== '' && (!/^\d+$/.test(value) || Number(value) > 25)) return;
    setLocalScores(prev => ({
      ...prev,
      [courtId]: { ...prev[courtId], [team]: value },
    }));
  };

  const handleSaveScores = async () => {
    if (!onUpdateScores) return;
    const scores: Array<{ courtId: string; team1Score: number; team2Score: number }> = [];
    for (const a of editedAssignments) {
      const s = localScores[a.courtId];
      if (s && s.team1 !== '' && s.team2 !== '') {
        scores.push({
          courtId: a.courtId,
          team1Score: Number(s.team1),
          team2Score: Number(s.team2),
        });
      }
    }
    if (scores.length === 0) return;
    try {
      await onUpdateScores(scores);
    } catch (err) {
      console.error('Failed to save scores:', err);
    }
  };

  const renderPlayerSlot = (
    assignment: Assignment,
    team: 'team1' | 'team2',
    playerId: string,
    index: number
  ) => {
    const isConflict = duplicatePlayerIds.has(playerId);

    if (!onUpdateAssignments) {
      return (
        <li key={`${assignment.id}-${team}-${index}`} className={`player-slot ${isConflict ? 'conflict' : ''}`}>
          <span>{getPlayerName(playerId)}</span>
        </li>
      );
    }

    const isDragOver = dropTarget !== null &&
      dropTarget.assignmentId === assignment.id &&
      dropTarget.team === team &&
      dropTarget.index === index;

    return (
      <DraggablePlayerSlot
        key={`${assignment.id}-${team}-${index}`}
        assignment={assignment}
        team={team}
        playerIndex={index}
        playerId={playerId}
        isConflict={isConflict}
        isDragOver={isDragOver}
        disabled={isSaving}
        onDragStart={handleDragStart}
        onDrop={handleDrop}
        onDragOverSlot={handleDragOverSlot}
        onDragLeave={handleDragLeave}
      >
        <PlayerTypeahead
          value={playerId}
          players={players}
          onChange={(newId) => handlePlayerChange(assignment.id, team, index, newId)}
          disabled={isSaving}
          playersOnBye={playersOnBye}
          hasError={isConflict}
        />
      </DraggablePlayerSlot>
    );
  };

  return (
    <div className={`round-display ${hasUnsavedChanges ? 'has-save-bar' : ''}`} onDragEnd={handleDragEnd}>
      <h2>Round {round.roundNumber}</h2>

      {sortedAssignments.length === 0 ? (
        <p>No assignments for this round</p>
      ) : (
        <div className="assignments">
          {sortedAssignments.map((assignment) => {
            const warnings = courtWarnings.get(assignment.courtId);
            return (
              <div key={assignment.id} className={`court-assignment ${warnings ? 'has-conflict' : ''}`}>
                <h3>{getCourtIdentifier(assignment.courtId)}</h3>
                <div className="teams">
                  <div className="team">
                    <h4>Team 1</h4>
                    <ul>
                      {assignment.team1PlayerIds.map((playerId, index) =>
                        renderPlayerSlot(assignment, 'team1', playerId, index)
                      )}
                    </ul>
                  </div>
                  <div className="vs-badge">VS</div>
                  <div className="team">
                    <h4>Team 2</h4>
                    <ul>
                      {assignment.team2PlayerIds.map((playerId, index) =>
                        renderPlayerSlot(assignment, 'team2', playerId, index)
                      )}
                    </ul>
                  </div>
                </div>
                {isManualMode && onUpdateScores && (
                  <div className="score-inputs">
                    <div className="score-input-group">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className={`score-input ${
                          localScores[assignment.courtId]?.team1 !== '' && localScores[assignment.courtId]?.team2 !== '' 
                            ? Number(localScores[assignment.courtId]?.team1 || 0) > Number(localScores[assignment.courtId]?.team2 || 0) ? 'winner' : '' 
                            : ''
                        }`}
                        placeholder="—"
                        value={localScores[assignment.courtId]?.team1 ?? ''}
                        onChange={(e) => handleScoreChange(assignment.courtId, 'team1', e.target.value)}
                        aria-label={`Team 1 score for ${getCourtIdentifier(assignment.courtId)}`}
                      />
                      <span className="score-separator">:</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className={`score-input ${
                          localScores[assignment.courtId]?.team1 !== '' && localScores[assignment.courtId]?.team2 !== '' 
                            ? Number(localScores[assignment.courtId]?.team2 || 0) > Number(localScores[assignment.courtId]?.team1 || 0) ? 'winner' : '' 
                            : ''
                        }`}
                        placeholder="—"
                        value={localScores[assignment.courtId]?.team2 ?? ''}
                        onChange={(e) => handleScoreChange(assignment.courtId, 'team2', e.target.value)}
                        aria-label={`Team 2 score for ${getCourtIdentifier(assignment.courtId)}`}
                      />
                    </div>
                  </div>
                )}
                {warnings && (
                  <div className="court-warnings">
                    {warnings.map((w, i) => (
                      <div key={i} className="court-warning">⚠️ {w}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasUnsavedChanges && newByePlayerNames.length > 0 && (
        <div className="bye-notice">
          {newByePlayerNames.map((name, i) => (
            <div key={i}>ℹ️ {name} is now on bye</div>
          ))}
        </div>
      )}

      {hasUnsavedChanges && (
        <div className="assignment-save-bar">
          <button
            onClick={handleSave}
            disabled={isSaving || hasConflicts}
            className="save-button"
            title={hasConflicts ? 'Fix duplicate assignments before saving' : ''}
          >
            {isSaving ? 'Saving...' : hasConflicts ? 'Fix Conflicts to Save' : 'Save Changes'}
          </button>
          <button onClick={handleDiscard} disabled={isSaving} className="cancel-button">
            Discard
          </button>
        </div>
      )}

      {playersOnBye.length > 0 && !hideByePlayers && (
        <div className="players-waiting">
          <h3>🪑 On Bench</h3>
          <ul>
            {[...playersOnBye]
              .sort((a, b) => (byeCounts[b.id] || 0) - (byeCounts[a.id] || 0))
              .map((player) => (
              onUpdateAssignments ? (
                <DraggableBenchPlayer
                  key={player.id}
                  player={player}
                  byeCount={byeCounts[player.id] || 0}
                  onDragStart={handleDragStart}
                  disabled={!onUpdateAssignments || isSaving}
                />
              ) : (
                <li key={player.id}>
                  {player.name}
                  {(byeCounts[player.id] || 0) > 0 && (
                    <span className="bye-count">({byeCounts[player.id]} {byeCounts[player.id] === 1 ? 'bye' : 'byes'})</span>
                  )}
                </li>
              )
            ))}
          </ul>
        </div>
      )}

      {isManualMode && onUpdateScores && (() => {
        const hasAnyScore = Object.values(localScores).some(s => s.team1 !== '' || s.team2 !== '');
        const scoresChanged = editedAssignments.some(a => {
          const s = localScores[a.courtId];
          if (!s) return false;
          const savedT1 = a.team1Score != null ? String(a.team1Score) : '';
          const savedT2 = a.team2Score != null ? String(a.team2Score) : '';
          return s.team1 !== savedT1 || s.team2 !== savedT2;
        });
        if (!hasAnyScore || !scoresChanged) return null;
        return (
          <div className="score-save-bar">
            <button className="save-button" onClick={handleSaveScores}>Save Scores</button>
          </div>
        );
      })()}
    </div>
  );
};

// --- PlayerTypeahead Component ---
interface PlayerTypeaheadProps {
  value: string;
  players: Player[];
  onChange: (playerId: string) => void;
  disabled?: boolean;
  playersOnBye: Player[];
  hasError?: boolean;
}

const PlayerTypeahead: React.FC<PlayerTypeaheadProps> = ({
  value,
  players,
  onChange,
  disabled = false,
  playersOnBye,
  hasError = false
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const currentPlayer = players.find(p => p.id === value);

  useEffect(() => {
    if (currentPlayer) {
      setInputValue(currentPlayer.name);
    }
  }, [value, currentPlayer]);

  const filteredPlayers = inputValue.trim()
    ? players.filter(p => p.name.toLowerCase().includes(inputValue.toLowerCase()))
    : players;

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    const aOnBye = playersOnBye.some(p => p.id === a.id);
    const bOnBye = playersOnBye.some(p => p.id === b.id);
    if (aOnBye && !bOnBye) return -1;
    if (!aOnBye && bOnBye) return 1;
    return a.name.localeCompare(b.name);
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setShowSuggestions(true);
    setFocusedIndex(-1);
  };

  const handleSelectPlayer = (player: Player) => {
    setInputValue(player.name);
    setShowSuggestions(false);
    setFocusedIndex(-1);
    onChange(player.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setShowSuggestions(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => prev < sortedPlayers.length - 1 ? prev + 1 : prev);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && sortedPlayers[focusedIndex]) {
          handleSelectPlayer(sortedPlayers[focusedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setFocusedIndex(-1);
        if (currentPlayer) setInputValue(currentPlayer.name);
        break;
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setShowSuggestions(false);
      setFocusedIndex(-1);
      const matchedPlayer = players.find(
        p => p.name.toLowerCase() === inputValue.toLowerCase()
      );
      if (!matchedPlayer && currentPlayer) {
        setInputValue(currentPlayer.name);
      }
    }, 200);
  };

  return (
    <div className="player-typeahead">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setShowSuggestions(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`player-typeahead-input ${hasError ? 'input-error' : ''}`}
        placeholder="Type player name..."
      />
      {showSuggestions && sortedPlayers.length > 0 && (
        <div ref={suggestionsRef} className="player-suggestions">
          {sortedPlayers.map((player, index) => {
            const isOnBye = playersOnBye.some(p => p.id === player.id);
            const isCurrent = player.id === value;
            return (
              <div
                key={player.id}
                className={`player-suggestion ${index === focusedIndex ? 'focused' : ''} ${isCurrent ? 'current' : ''}`}
                onMouseDown={() => handleSelectPlayer(player)}
                onMouseEnter={() => setFocusedIndex(index)}
              >
                {player.name}
                {isCurrent && <span className="badge">current</span>}
                {isOnBye && <span className="badge bye">bye</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RoundDisplay;
