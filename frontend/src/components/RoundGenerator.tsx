import React, { useState } from 'react';
import log from '../utils/logger';

interface RoundGeneratorProps {
  leagueId: string;
  onGenerateRound: () => Promise<void>;
  currentRoundCount: number;
}

/**
 * RoundGenerator Component
 * 
 * Provides a button to generate a new round with automatic player assignments.
 * Shows loading state during generation and displays errors if generation fails.
 * 
 * Requirements: 4.1, 6.1
 */
const RoundGenerator: React.FC<RoundGeneratorProps> = ({
  leagueId,
  onGenerateRound,
  currentRoundCount
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

  return (
    <div className="round-generator">
      <button
        onClick={handleGenerate}
        disabled={isGenerating || !leagueId}
        className="generate-button-hero"
      >
        {isGenerating ? 'Generating...' : currentRoundCount === 0 ? '▶  START ROUND 1' : `▶  START ROUND ${currentRoundCount + 1}`}
      </button>

      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default RoundGenerator;
