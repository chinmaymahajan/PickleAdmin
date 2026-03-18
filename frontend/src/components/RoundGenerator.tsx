import React, { useState } from 'react';
import log from '../utils/logger';

interface RoundGeneratorProps {
  leagueId: string;
  onGenerateRound: () => Promise<void>;
  onStartRound?: () => void;
  currentRoundCount: number;
  /** The round number currently being viewed (for the Start button label) */
  viewingRoundNumber?: number;
  /** True when the current round's timer is running or has expired */
  roundStarted: boolean;
  /** Compact mode renders a smaller button for toolbar placement */
  compact?: boolean;
}
/**
 * RoundGenerator Component
 * 
 * In manual mode, provides two actions:
 * 1. Generate the next round (creates assignments to preview)
 * 2. Start the current round (kicks off the timer)
 * 
 * Requirements: 4.1, 6.1
 */
const RoundGenerator: React.FC<RoundGeneratorProps> = ({
  leagueId,
  onGenerateRound,
  onStartRound,
  currentRoundCount,
  viewingRoundNumber,
  roundStarted,
  compact,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    setIsGenerating(true);
    log.round.info('Generate round clicked — current count:', currentRoundCount);

    try {
      await onGenerateRound();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate round');
    } finally {
      setIsGenerating(false);
    }
  };

  // Show "Start Round N" when a round exists but hasn't been started yet
  const showStartButton = currentRoundCount > 0 && !roundStarted && onStartRound;

  if (compact) {
    return (
      <button
        onClick={handleGenerate}
        disabled={isGenerating || !leagueId}
        className="generate-button-compact"
      >
        {isGenerating ? '...' : `🎲 Next Round`}
      </button>
    );
  }

  return (
    <div className="round-generator">
      {showStartButton ? (
        <button
          onClick={onStartRound}
          className="generate-button-hero"
        >
          ▶  START ROUND {viewingRoundNumber ?? currentRoundCount}
        </button>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !leagueId}
          className="generate-button-hero"
        >
          {isGenerating
            ? 'Generating...'
            : currentRoundCount === 0
              ? '🎲  GENERATE ROUND 1'
              : `🎲  GENERATE ROUND ${currentRoundCount + 1}`
          }
        </button>
      )}

      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default RoundGenerator;
