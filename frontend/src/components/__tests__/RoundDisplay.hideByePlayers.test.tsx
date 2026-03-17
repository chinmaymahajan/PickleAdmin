import { render, screen } from '@testing-library/react';
import RoundDisplay from '../RoundDisplay';
import { Round, Assignment, Court, Player } from '../../types';

const mockRound: Round = {
  id: 'round1',
  leagueId: 'league1',
  roundNumber: 3,
  createdAt: new Date(),
};

const mockCourts: Court[] = [
  { id: 'court1', leagueId: 'league1', identifier: 'Court 1', createdAt: new Date() },
];

const mockPlayers: Player[] = [
  { id: 'p1', leagueId: 'league1', name: 'Alice', createdAt: new Date() },
  { id: 'p2', leagueId: 'league1', name: 'Bob', createdAt: new Date() },
  { id: 'p3', leagueId: 'league1', name: 'Carol', createdAt: new Date() },
  { id: 'p4', leagueId: 'league1', name: 'Dave', createdAt: new Date() },
  { id: 'p5', leagueId: 'league1', name: 'Eve', createdAt: new Date() },
];

// Only 4 assigned, Eve is on bye
const mockAssignments: Assignment[] = [
  {
    id: 'a1',
    roundId: 'round1',
    courtId: 'court1',
    team1PlayerIds: ['p1', 'p2'],
    team2PlayerIds: ['p3', 'p4'],
    createdAt: new Date(),
  },
];

describe('RoundDisplay — hideByePlayers prop', () => {
  it('should show "On Bench" by default when players are on bye', () => {
    render(
      <RoundDisplay
        round={mockRound}
        assignments={mockAssignments}
        courts={mockCourts}
        players={mockPlayers}
        byeCounts={{ p5: 2 }}
      />
    );
    expect(screen.getByText('🪑 On Bench')).toBeInTheDocument();
    expect(screen.getByText(/Eve/)).toBeInTheDocument();
  });

  it('should hide "On Bench" when hideByePlayers is true', () => {
    render(
      <RoundDisplay
        round={mockRound}
        assignments={mockAssignments}
        courts={mockCourts}
        players={mockPlayers}
        byeCounts={{ p5: 2 }}
        hideByePlayers={true}
      />
    );
    expect(screen.queryByText('🪑 On Bench')).not.toBeInTheDocument();
  });

  it('should show "On Bench" when hideByePlayers is false', () => {
    render(
      <RoundDisplay
        round={mockRound}
        assignments={mockAssignments}
        courts={mockCourts}
        players={mockPlayers}
        byeCounts={{ p5: 2 }}
        hideByePlayers={false}
      />
    );
    expect(screen.getByText('🪑 On Bench')).toBeInTheDocument();
  });
});
