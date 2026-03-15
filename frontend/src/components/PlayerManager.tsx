import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Player } from '../types';

interface PlayerManagerProps {
  leagueId: string;
  players: Player[];
  onAddPlayer: (name: string) => Promise<void>;
  onImportPlayers?: (names: string[]) => Promise<void>;
  onRemovePlayer: (playerId: string) => Promise<void>;
  nextInputId?: string;
}

const PlayerManager: React.FC<PlayerManagerProps> = ({
  players,
  onAddPlayer,
  onImportPlayers,
  onRemovePlayer,
  nextInputId
}) => {
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldRefocus = useRef(false);

  // Import state
  const [importNames, setImportNames] = useState<string[]>([]);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!isSubmitting && shouldRefocus.current) {
      shouldRefocus.current = false;
      inputRef.current?.focus();
    }
  }, [isSubmitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!playerName.trim()) { setError('Player name cannot be empty'); return; }
    if (players.length >= 100) { setError('Maximum of 100 players per session reached'); return; }
    setIsSubmitting(true);
    shouldRefocus.current = true;
    try {
      await onAddPlayer(playerName);
      setPlayerName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add player');
    } finally { setIsSubmitting(false); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

        // Find the column that contains player names — prioritize exact matches
        const keys = Object.keys(rows[0] || {});
        const nameKey =
          keys.find(k => /^player.?name$/i.test(k.trim())) ||
          keys.find(k => /player.?name/i.test(k.trim())) ||
          keys.find(k => /^name$/i.test(k.trim()));

        if (!nameKey) {
          setError('Could not find a "Player Name" column in the file');
          return;
        }

        const existingNames = new Set(players.map(p => p.name.toLowerCase()));
        const names = rows
          .map(r => String(r[nameKey] || '').trim())
          .filter(n => n.length > 0)
          .filter(n => !existingNames.has(n.toLowerCase()));

        // Deduplicate within the import itself
        const unique = [...new Set(names.map(n => n.toLowerCase()))].map(lower =>
          names.find(n => n.toLowerCase() === lower)!
        );

        if (unique.length === 0) {
          setError('No new players found in file (all may already exist)');
          return;
        }

        // Cap import to stay within 100 player limit
        const slotsAvailable = 100 - players.length;
        const toImport = unique.slice(0, slotsAvailable);
        if (toImport.length < unique.length) {
          setError(`Only importing ${toImport.length} of ${unique.length} players (100 player limit)`);
        }

        setImportNames(toImport);
        setShowImportPreview(true);
      } catch {
        setError('Failed to read file. Please use .xlsx or .csv format.');
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    setShowImportPreview(false);
    if (onImportPlayers) {
      setImportProgress({ done: 0, total: importNames.length });
      try {
        await onImportPlayers(importNames);
      } catch { /* errors handled by parent */ }
      setImportProgress(null);
      setImportNames([]);
    }
  };

  return (
    <div className="player-manager">
      <h2>Players</h2>
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <input
            ref={inputRef}
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Tab' && !e.shiftKey && nextInputId) {
                const next = document.getElementById(nextInputId);
                if (next) { e.preventDefault(); next.focus(); }
              }
            }}
            placeholder="Player name"
            disabled={isSubmitting}
          />
          <button type="submit" disabled={isSubmitting}>Add</button>
          <button
            type="button"
            className="import-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
            title="Import players from Excel/CSV"
          >📥 Import</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      </form>
      {error && <div className="error-message">{error}</div>}
      {importProgress && (
        <div className="import-progress">
          Importing players… {importProgress.done}/{importProgress.total}
        </div>
      )}
      {showImportPreview && (
        <div className="import-preview-overlay">
          <div className="import-preview">
            <h3>Import {importNames.length} player{importNames.length !== 1 ? 's' : ''}?</h3>
            <ul className="import-preview-list">
              {importNames.map((name, i) => <li key={i}>{name}</li>)}
            </ul>
            <div className="import-preview-actions">
              <button className="import-confirm-btn" onClick={handleImportConfirm}>Import All</button>
              <button className="import-cancel-btn" onClick={() => { setShowImportPreview(false); setImportNames([]); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div className="player-list">
        {players.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧍</div>
            <div className="empty-state-text">No players yet</div>
            <div className="empty-state-hint">Add players above or import from Excel</div>
          </div>
        ) : (
          <ul className="player-grid">
            {players.map((player) => (
              <li key={player.id}>
                <span>{player.name}</span>
                <button
                  className="remove-btn"
                  onClick={() => onRemovePlayer(player.id)}
                  title={`Remove ${player.name}`}
                  aria-label={`Remove ${player.name}`}
                >×</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PlayerManager;