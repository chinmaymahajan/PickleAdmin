import { render, screen, fireEvent } from '@testing-library/react';
import DraggablePlayerSlot from '../DraggablePlayerSlot';
import { Assignment } from '../../types';
import { DragData } from '../dragTypes';

describe('DraggablePlayerSlot', () => {
  const mockAssignment: Assignment = {
    id: 'a1',
    roundId: 'round1',
    courtId: 'court1',
    team1PlayerIds: ['p1', 'p2'],
    team2PlayerIds: ['p3', 'p4'],
    createdAt: new Date(),
  };

  const defaultProps = {
    assignment: mockAssignment,
    team: 'team1' as const,
    playerIndex: 0,
    playerId: 'p1',
    isConflict: false,
    isDragOver: false,
    disabled: false,
    onDragStart: jest.fn(),
    onDrop: jest.fn(),
    onDragOverSlot: jest.fn(),
    onDragLeave: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serializes correct DragData on dragstart', () => {
    render(
      <DraggablePlayerSlot {...defaultProps}>
        <span>Player 1</span>
      </DraggablePlayerSlot>
    );

    const li = screen.getByText('Player 1').closest('li')!;
    const setData = jest.fn();
    fireEvent.dragStart(li, {
      dataTransfer: { setData, effectAllowed: '' },
    });

    expect(setData).toHaveBeenCalledWith(
      'application/json',
      JSON.stringify({
        playerId: 'p1',
        source: { type: 'court', assignmentId: 'a1', team: 'team1', index: 0 },
      })
    );
    expect(defaultProps.onDragStart).toHaveBeenCalledWith({
      playerId: 'p1',
      source: { type: 'court', assignmentId: 'a1', team: 'team1', index: 0 },
    });
  });

  it('applies drag-over class when isDragOver is true', () => {
    render(
      <DraggablePlayerSlot {...defaultProps} isDragOver={true}>
        <span>Player 1</span>
      </DraggablePlayerSlot>
    );

    const li = screen.getByText('Player 1').closest('li')!;
    expect(li.className).toContain('drag-over');
  });

  it('does not apply drag-over class when isDragOver is false', () => {
    render(
      <DraggablePlayerSlot {...defaultProps} isDragOver={false}>
        <span>Player 1</span>
      </DraggablePlayerSlot>
    );

    const li = screen.getByText('Player 1').closest('li')!;
    expect(li.className).not.toContain('drag-over');
  });

  it('calls onDrop with correct target info on drop', () => {
    render(
      <DraggablePlayerSlot {...defaultProps}>
        <span>Player 1</span>
      </DraggablePlayerSlot>
    );

    const li = screen.getByText('Player 1').closest('li')!;
    const dragData: DragData = {
      playerId: 'p3',
      source: { type: 'court', assignmentId: 'a1', team: 'team2', index: 0 },
    };

    fireEvent.drop(li, {
      dataTransfer: {
        getData: () => JSON.stringify(dragData),
      },
    });

    expect(defaultProps.onDrop).toHaveBeenCalledWith('a1', 'team1', 0);
  });

  it('sets draggable=false when disabled', () => {
    render(
      <DraggablePlayerSlot {...defaultProps} disabled={true}>
        <span>Player 1</span>
      </DraggablePlayerSlot>
    );

    const li = screen.getByText('Player 1').closest('li')!;
    expect(li.getAttribute('draggable')).toBe('false');
  });

  it('sets draggable=true when not disabled', () => {
    render(
      <DraggablePlayerSlot {...defaultProps} disabled={false}>
        <span>Player 1</span>
      </DraggablePlayerSlot>
    );

    const li = screen.getByText('Player 1').closest('li')!;
    expect(li.getAttribute('draggable')).toBe('true');
  });

  it('calls onDragOverSlot on dragover', () => {
    render(
      <DraggablePlayerSlot {...defaultProps}>
        <span>Player 1</span>
      </DraggablePlayerSlot>
    );

    const li = screen.getByText('Player 1').closest('li')!;
    fireEvent.dragOver(li);

    expect(defaultProps.onDragOverSlot).toHaveBeenCalledWith('a1', 'team1', 0);
  });

  it('calls onDragLeave on dragleave', () => {
    render(
      <DraggablePlayerSlot {...defaultProps}>
        <span>Player 1</span>
      </DraggablePlayerSlot>
    );

    const li = screen.getByText('Player 1').closest('li')!;
    fireEvent.dragLeave(li);

    expect(defaultProps.onDragLeave).toHaveBeenCalled();
  });

  it('applies conflict class when isConflict is true', () => {
    render(
      <DraggablePlayerSlot {...defaultProps} isConflict={true}>
        <span>Player 1</span>
      </DraggablePlayerSlot>
    );

    const li = screen.getByText('Player 1').closest('li')!;
    expect(li.className).toContain('conflict');
  });

  it('renders children inside the li', () => {
    render(
      <DraggablePlayerSlot {...defaultProps}>
        <span data-testid="child">Child Content</span>
      </DraggablePlayerSlot>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
