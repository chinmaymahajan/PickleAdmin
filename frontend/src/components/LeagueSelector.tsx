import React, { useState } from 'react';
import { League, LeagueFormat } from '../types';
import FormatSelector from './FormatSelector';
import PickleballIcon from './PickleballIcon';
import log from '../utils/logger';

interface LeagueSelectorProps {
  leagues: League[];
  selectedLeagueId: string | null;
  onSelect: (leagueId: string) => void;
  onCreateLeague?: (name: string, format: LeagueFormat) => Promise<void>;
  onDeleteLeague?: (leagueId: string) => Promise<void>;
  /** When true, renders as compact session switcher (for Setup tab) */
  compact?: boolean;
}

const formatLabel = (f: string) => f === 'round_robin' ? 'Round Robin' : f;

const formatDate = (date: Date) => {
  const d = new Date(date);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const LeagueSelector: React.FC<LeagueSelectorProps> = ({
  leagues,
  selectedLeagueId,
  onSelect,
  onCreateLeague,
  onDeleteLeague,
  compact = false
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [selectedFormat, setSelectedFormat] = useState<LeagueFormat>(LeagueFormat.ROUND_ROBIN);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    log.league.info('Create league submit —', leagueName, selectedFormat);
    if (!leagueName.trim()) { setError('Session name cannot be empty'); return; }
    if (leagues.length >= 10) { setError('Maximum of 10 active sessions reached'); return; }
    if (!onCreateLeague) return;
    setIsSubmitting(true);
    try {
      await onCreateLeague(leagueName, selectedFormat);
      setLeagueName('');
      setSelectedFormat(LeagueFormat.ROUND_ROBIN);
      setShowCreateForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally { setIsSubmitting(false); }
  };

  const handleDelete = async (leagueId: string) => {
    if (!onDeleteLeague) return;
    log.league.info('Delete league —', leagueId);
    setIsSubmitting(true);
    try {
      await onDeleteLeague(leagueId);
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session');
    } finally {
      setIsSubmitting(false);
    }
  };

  const createForm = (
    <form onSubmit={handleSubmit} className="create-league-form">
      <FormatSelector
        selectedFormat={selectedFormat}
        onSelect={setSelectedFormat}
        disabled={isSubmitting}
      />
      <input
        type="text"
        value={leagueName}
        onChange={(e) => setLeagueName(e.target.value)}
        placeholder="Session name (e.g. Tuesday Ladder)"
        disabled={isSubmitting}
        autoFocus
      />
      <div>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create'}
        </button>
        <button
          type="button"
          onClick={() => { setShowCreateForm(false); setLeagueName(''); setError(null); }}
          disabled={isSubmitting}
        >Cancel</button>
      </div>
      {error && <div className="error-message">{error}</div>}
    </form>
  );

  // --- Compact mode: simple dropdown for Setup tab ---
  if (compact) {
    return (
      <div className="league-selector">
        <h2>Session</h2>
        <select
          value={selectedLeagueId || ''}
          onChange={(e) => onSelect(e.target.value)}
          className="league-select"
        >
          <option value="">-- Switch Session --</option>
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({formatLabel(l.format)})
            </option>
          ))}
        </select>
      </div>
    );
  }

  // --- Landing page mode ---
  // No sessions exist
  if (leagues.length === 0) {
    return (
      <div className="landing-page">
        <div className="landing-hero">
          <div className="landing-icon"><PickleballIcon size={64} /></div>
          <h1>Welcome to Pickle Admin</h1>
          <p className="landing-subtitle">
            Run pickleball sessions, ladders and open play in seconds.
          </p>
        </div>
        {showCreateForm ? createForm : (
          <button
            onClick={() => setShowCreateForm(true)}
            className="landing-cta"
          >
            Start New Session
          </button>
        )}
      </div>
    );
  }

  // Sessions exist
  return (
    <div className="landing-page">
      <h2 className="landing-sessions-title">Your Sessions</h2>
      <div className="session-list">
        {leagues.map((league) => (
          <div
            key={league.id}
            className={`session-card ${selectedLeagueId === league.id ? 'active' : ''}`}
          >
            <div className="session-card-info">
              <span className="session-card-name">{league.name}</span>
              <span className="session-card-meta">
                Session Format: {formatLabel(league.format)} · Created {formatDate(league.createdAt)}
              </span>
            </div>
            <div className="session-card-actions">
              <button
                className="session-card-btn"
                onClick={() => onSelect(league.id)}
              >
                Resume
              </button>
              {onDeleteLeague && (
                <button
                  className="session-card-delete"
                  onClick={() => setConfirmDeleteId(league.id)}
                  aria-label={`Delete ${league.name}`}
                >
                  🗑
                </button>
              )}
            </div>
            {confirmDeleteId === league.id && (
              <div className="session-delete-confirm">
                <p>Delete "{league.name}" session and all its data? This cannot be undone.</p>
                <div className="session-delete-actions">
                  <button
                    className="session-delete-yes"
                    onClick={() => handleDelete(league.id)}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Deleting...' : 'Delete'}
                  </button>
                  <button
                    className="session-delete-no"
                    onClick={() => setConfirmDeleteId(null)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="landing-new-session">
        {showCreateForm ? createForm : (
          <button
            onClick={() => setShowCreateForm(true)}
            className="landing-new-btn"
          >
            + New Session
          </button>
        )}
      </div>
    </div>
  );
};

export default LeagueSelector;
