import React, { useState } from 'react';
import log from '../utils/logger';

interface DevToolsProps {
  onSeedData: () => Promise<void>;
  onClearData: () => Promise<void>;
}

/**
 * DevTools Component
 * 
 * Development utilities for testing:
 * - Seed mock data (league, players, courts)
 * - Clear all data
 */
const DevTools: React.FC<DevToolsProps> = ({ onSeedData, onClearData }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSeed = async () => {
    if (!confirm('This will clear existing data and create mock data. Continue?')) {
      return;
    }
    log.dev.info('Seed mock data confirmed');
    setIsLoading(true);
    try {
      await onSeedData();
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('This will delete ALL data. Are you sure?')) {
      return;
    }
    log.dev.warn('Clear all data confirmed');
    setIsLoading(true);
    try {
      await onClearData();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="dev-tools">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="dev-tools-toggle"
      >
        🛠️ Dev Tools {isExpanded ? '▼' : '▶'}
      </button>

      {isExpanded && (
        <div className="dev-tools-panel">
          <h3>Development Utilities</h3>
          <p className="dev-tools-warning">
            ⚠️ These actions affect all data in the system
          </p>
          <div className="dev-tools-actions">
            <button
              onClick={handleSeed}
              disabled={isLoading}
              className="dev-button seed-button"
            >
              {isLoading ? 'Loading...' : '🌱 Seed Mock Data'}
            </button>
            <button
              onClick={handleClear}
              disabled={isLoading}
              className="dev-button clear-button"
            >
              {isLoading ? 'Loading...' : '🗑️ Clear All Data'}
            </button>
          </div>
          <div className="dev-tools-info">
            <p><strong>Seed Mock Data:</strong> Creates a test league with 27 players and 7 courts</p>
            <p><strong>Clear All Data:</strong> Removes all leagues, players, courts, rounds, and assignments</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DevTools;
