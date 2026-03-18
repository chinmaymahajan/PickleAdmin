import { render, screen, fireEvent } from '@testing-library/react';
import DraggableBenchPlayer from '../DraggableBenchPlayer';
import { Player } from '../../types';

describe('DraggableBenchPlayer', () => {
  const mockPlayer: Player = {
    id: 'p5',
    leagueId: 'league1',
    name: 'Bench Player',
    createdAt: new Date(),
  };

  const defaultProps = {
    player: mockPlayer,
    byeCount: 2,
    onDragStart: jest.fn(),
    disabled: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serializes DragData with source type "bench" on dragstart', () => {
    render(<DraggableBenchPlayer {...defaultProps} />);

    const li = screen.getByText('Bench Player').closest('li')!;
    const setData = jest.fn();
    fireEvent.dragStart(li, {
      dataTransfer: { setData, effectAllowed: '' },
    });

    expect(setData).toHaveBeenCalledWith(
      'application/json',
      JSON.stringify({
        playerId: 'p5',
        source: { type: 'bench' },
      })
    );
    expect(defaultProps.onDragStart).toHaveBeenCalledWith({
      playerId: 'p5',
      source: { type: 'bench' },
    });
  });

  it('sets draggable=false when disabled', () => {
    render(<DraggableBenchPlayer {...defaultProps} disabled={true} />);

    const li = screen.getByText('Bench Player').closest('li')!;
    expect(li.getAttribute('draggable')).toBe('false');
  });

  it('sets draggable=true when not disabled', () => {
    render(<DraggableBenchPlayer {...defaultProps} disabled={false} />);

    const li = screen.getByText('Bench Player').closest('li')!;
    expect(li.getAttribute('draggable')).toBe('true');
  });

  it('shows grab cursor when not disabled', () => {
    render(<DraggableBenchPlayer {...defaultProps} disabled={false} />);

    const li = screen.getByText('Bench Player').closest('li')!;
    expect(li.style.cursor).toBe('grab');
  });

  it('shows default cursor when disabled', () => {
    render(<DraggableBenchPlayer {...defaultProps} disabled={true} />);

    const li = screen.getByText('Bench Player').closest('li')!;
    expect(li.style.cursor).toBe('default');
  });

  it('displays player name and bye count', () => {
    render(<DraggableBenchPlayer {...defaultProps} />);

    expect(screen.getByText('Bench Player')).toBeInTheDocument();
    expect(screen.getByText('(2 byes)')).toBeInTheDocument();
  });

  it('displays singular "bye" for count of 1', () => {
    render(<DraggableBenchPlayer {...defaultProps} byeCount={1} />);

    expect(screen.getByText('(1 bye)')).toBeInTheDocument();
  });

  it('does not display bye count when zero', () => {
    render(<DraggableBenchPlayer {...defaultProps} byeCount={0} />);

    expect(screen.queryByText(/bye/)).not.toBeInTheDocument();
  });
});
