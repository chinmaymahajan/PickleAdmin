import React, { useState, useRef, useEffect } from 'react';
import { Court } from '../types';
import CourtIcon from './CourtIcon';

interface CourtManagerProps {
  leagueId: string;
  courts: Court[];
  onAddCourt: (identifier: string) => Promise<void>;
  onRemoveCourt: (courtId: string) => Promise<void>;
  inputId?: string;
}

const CourtManager: React.FC<CourtManagerProps> = ({
  courts,
  onAddCourt,
  onRemoveCourt,
  inputId
}) => {
  const [courtIdentifier, setCourtIdentifier] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldRefocus = useRef(false);

  useEffect(() => {
    if (!isSubmitting && shouldRefocus.current) {
      shouldRefocus.current = false;
      inputRef.current?.focus();
    }
  }, [isSubmitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!courtIdentifier.trim()) { setError('Court number cannot be empty'); return; }
    if (isNaN(Number(courtIdentifier))) { setError('Please enter a number'); return; }
    if (courts.length >= 30) { setError('Maximum of 30 courts per session reached'); return; }
    if (courts.some(c => c.identifier === `Court ${courtIdentifier.trim()}`)) { setError(`Court ${courtIdentifier.trim()} already exists`); return; }
    setIsSubmitting(true);
    shouldRefocus.current = true;
    try {
      await onAddCourt(`Court ${courtIdentifier.trim()}`);
      setCourtIdentifier('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add court');
    } finally { setIsSubmitting(false); }
  };

  return (
    <div className="court-manager">
      <h2>Courts</h2>
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <input
            ref={inputRef}
            id={inputId}
            type="number"
            value={courtIdentifier}
            onChange={(e) => setCourtIdentifier(e.target.value)}
            placeholder="Court #"
            disabled={isSubmitting}
            min="1"
          />
          <button type="submit" disabled={isSubmitting}>Add</button>
        </div>
      </form>
      {error && <div className="error-message">{error}</div>}
      <div className="court-list">
        {courts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><CourtIcon size={48} /></div>
            <div className="empty-state-text">No courts yet</div>
            <div className="empty-state-hint">Add courts to assign players</div>
          </div>
        ) : (
          <ul>
            {courts.map((court) => (
              <li key={court.id}>
                <span>{court.identifier}</span>
                <button
                  className="remove-btn"
                  onClick={() => onRemoveCourt(court.id)}
                  title={`Remove ${court.identifier}`}
                  aria-label={`Remove ${court.identifier}`}
                >×</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CourtManager;
