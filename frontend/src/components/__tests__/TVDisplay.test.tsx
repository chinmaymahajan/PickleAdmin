import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TVDisplay from '../TVDisplay';
import { Round, Assignment, Court, Player } from '../../types';

const makeRound = (overrides: Partial<Round> = {}): Round => ({
  id: 'r1',
  leagueId: 'l1',
  roundNumber: 1,
  createdAt: new Date(),
  ...overrides,
});

const makePlayers = (): Player[] => [
  { id: 'p1', leagueId: 'l1', name: 'Alice', createdAt: new Date() },
  { id: 'p2', leagueId: 'l1', name: 'Bob', createdAt: new Date() },
  { id: 'p3', leagueId: 'l1', name: 'Carol', createdAt: new Date() },
  { id: 'p4', leagueId: 'l1', name: 'Dave', createdAt: new Date() },
  { id: 'p5', leagueId: 'l1', name: 'Eve', createdAt: new Date() },
];

const makeCourts = (): Court[] => [
  { id: 'c1', leagueId: 'l1', identifier: 'Court 1', createdAt: new Date() },
  { id: 'c2', leagueId: 'l1', identifier: 'Court 2', createdAt: new Date() },
];

const makeAssignments = (): Assignment[] => [
  { id: 'a1', roundId: 'r1', courtId: 'c1', team1PlayerIds: ['p1', 'p2'], team2PlayerIds: ['p3', 'p4'], createdAt: new Date() },
];

const defaultProps = {
  round: makeRound(),
  assignments: makeAssignments(),
  courts: makeCourts(),
  players: makePlayers(),
  leagueName: 'Test League',
  onExit: jest.fn(),
  timeRemaining: 300000,
  timerActive: false,
  timerExpired: false,
  isOnBreak: false,
  isLastRound: false,
  formatTime: (ms: number) => {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  },
};

describe('TVDisplay', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders league name and round number', () => {
    render(<TVDisplay {...defaultProps} />);
    expect(screen.getByText('Test League')).toBeInTheDocument();
    expect(screen.getByText('Round 1')).toBeInTheDocument();
  });

  it('renders court names', () => {
    render(<TVDisplay {...defaultProps} />);
    expect(screen.getByText('Court 1')).toBeInTheDocument();
  });

  it('renders team members joined with +', () => {
    render(<TVDisplay {...defaultProps} />);
    expect(screen.getByText('Alice + Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol + Dave')).toBeInTheDocument();
  });

  it('shows waiting players not assigned to any court', () => {
    render(<TVDisplay {...defaultProps} />);
    expect(screen.getByText(/Eve/)).toBeInTheDocument();
    expect(screen.getByText('🪑 Next In Line')).toBeInTheDocument();
  });

  it('does not show waiting section when all players are assigned', () => {
    const allAssigned: Assignment[] = [
      { id: 'a1', roundId: 'r1', courtId: 'c1', team1PlayerIds: ['p1', 'p2'], team2PlayerIds: ['p3', 'p4'], createdAt: new Date() },
      { id: 'a2', roundId: 'r1', courtId: 'c2', team1PlayerIds: ['p5'], team2PlayerIds: [], createdAt: new Date() },
    ];
    render(<TVDisplay {...defaultProps} assignments={allAssigned} />);
    expect(screen.queryByText('🪑 Next In Line')).not.toBeInTheDocument();
  });

  it('calls onExit when overlay is clicked', () => {
    const onExit = jest.fn();
    render(<TVDisplay {...defaultProps} onExit={onExit} />);
    fireEvent.click(screen.getByText('Test League').closest('.tv-overlay')!);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('does not call onExit when content area is clicked', () => {
    const onExit = jest.fn();
    render(<TVDisplay {...defaultProps} onExit={onExit} />);
    fireEvent.click(screen.getByText('Test League'));
    expect(onExit).not.toHaveBeenCalled();
  });

  it('calls onExit when exit button is clicked', () => {
    const onExit = jest.fn();
    render(<TVDisplay {...defaultProps} onExit={onExit} />);
    fireEvent.click(screen.getByLabelText('Exit TV mode'));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('calls onExit when Escape key is pressed', () => {
    const onExit = jest.fn();
    render(<TVDisplay {...defaultProps} onExit={onExit} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('does not call onExit for non-Escape keys', () => {
    const onExit = jest.fn();
    render(<TVDisplay {...defaultProps} onExit={onExit} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onExit).not.toHaveBeenCalled();
  });

  it('shows timer when active', () => {
    render(<TVDisplay {...defaultProps} timerActive={true} timeRemaining={120000} />);
    expect(screen.getByText('2:00')).toBeInTheDocument();
  });

  it('shows TIME\'S UP when expired and last round', () => {
    render(<TVDisplay {...defaultProps} timerExpired={true} isLastRound={true} timerActive={false} timeRemaining={0} />);
    expect(screen.getByText("TIME'S UP")).toBeInTheDocument();
  });

  it('shows break timer during break', () => {
    render(<TVDisplay {...defaultProps} timerActive={true} isOnBreak={true} timeRemaining={60000} />);
    expect(screen.getByText('BREAK 1:00')).toBeInTheDocument();
  });

  it('shows "Up Next" during break with next round', () => {
    const nextRound = makeRound({ id: 'r2', roundNumber: 2 });
    render(
      <TVDisplay
        {...defaultProps}
        isOnBreak={true}
        timerActive={true}
        timeRemaining={60000}
        nextRound={nextRound}
        nextAssignments={makeAssignments()}
      />
    );
    expect(screen.getByText('Up Next — Round 2')).toBeInTheDocument();
  });

  it('applies tv-compact class for 5-6 courts', () => {
    const courts: Court[] = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`, leagueId: 'l1', identifier: `Court ${i + 1}`, createdAt: new Date(),
    }));
    const assignments: Assignment[] = courts.map((c, i) => ({
      id: `a${i}`, roundId: 'r1', courtId: c.id,
      team1PlayerIds: ['p1'], team2PlayerIds: ['p2'], createdAt: new Date(),
    }));
    const { container } = render(
      <TVDisplay {...defaultProps} courts={courts} assignments={assignments} />
    );
    expect(container.querySelector('.tv-compact')).toBeInTheDocument();
    expect(container.querySelector('.tv-dense')).not.toBeInTheDocument();
  });

  it('applies tv-dense class for 7+ courts', () => {
    const courts: Court[] = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i}`, leagueId: 'l1', identifier: `Court ${i + 1}`, createdAt: new Date(),
    }));
    const assignments: Assignment[] = courts.map((c, i) => ({
      id: `a${i}`, roundId: 'r1', courtId: c.id,
      team1PlayerIds: ['p1'], team2PlayerIds: ['p2'], createdAt: new Date(),
    }));
    const { container } = render(
      <TVDisplay {...defaultProps} courts={courts} assignments={assignments} />
    );
    expect(container.querySelector('.tv-dense')).toBeInTheDocument();
  });

  it('applies round-enter animation when round changes', () => {
    const { container, rerender } = render(<TVDisplay {...defaultProps} />);
    expect(container.querySelector('.tv-round-enter')).not.toBeInTheDocument();

    const newRound = makeRound({ roundNumber: 2 });
    rerender(<TVDisplay {...defaultProps} round={newRound} />);
    expect(container.querySelector('.tv-round-enter')).toBeInTheDocument();
  });

  it('shows ? for unknown player ids', () => {
    const assignments: Assignment[] = [
      { id: 'a1', roundId: 'r1', courtId: 'c1', team1PlayerIds: ['unknown1'], team2PlayerIds: ['unknown2'], createdAt: new Date() },
    ];
    render(<TVDisplay {...defaultProps} assignments={assignments} />);
    const teams = screen.getAllByText('?');
    expect(teams.length).toBeGreaterThanOrEqual(2);
  });

  it('renders VS divider between teams', () => {
    const { container } = render(<TVDisplay {...defaultProps} />);
    expect(container.querySelector('.tv-vs')).toBeInTheDocument();
    expect(container.querySelector('.tv-vs')?.textContent).toBe('VS');
  });
});
