import React, { useState } from 'react';
import { Assignment } from '../types';
import { DragData } from './dragTypes';

interface DraggablePlayerSlotProps {
  assignment: Assignment;
  team: 'team1' | 'team2';
  playerIndex: number;
  playerId: string;
  isConflict: boolean;
  isDragOver: boolean;
  disabled: boolean;
  onDragStart: (data: DragData) => void;
  onDrop: (targetAssignmentId: string, targetTeam: 'team1' | 'team2', targetIndex: number) => void;
  onDragOverSlot: (assignmentId: string, team: 'team1' | 'team2', index: number) => void;
  onDragLeave: () => void;
  children: React.ReactNode;
}

const DraggablePlayerSlot: React.FC<DraggablePlayerSlotProps> = ({
  assignment,
  team,
  playerIndex,
  playerId,
  isConflict,
  isDragOver,
  disabled,
  onDragStart,
  onDrop,
  onDragOverSlot,
  onDragLeave,
  children,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  // Prevent the input from gaining focus when the user mousedowns to start
  // a drag. Without this, the browser focuses the input → typeahead opens →
  // suggestions appear in the drag ghost image.
  const handleMouseDown = (e: React.MouseEvent<HTMLLIElement>) => {
    const target = e.target as HTMLElement;
    // Only suppress when clicking outside the input itself (i.e. starting a drag
    // from the <li> padding/border area or the player name text). If the user
    // clicks directly on the input, let normal focus behavior happen so they
    // can type to search.
    if (target.tagName !== 'INPUT') {
      e.preventDefault();
    }
  };

  const handleDragStart = (e: React.DragEvent<HTMLLIElement>) => {
    // Also blur in case the input was already focused before this drag started
    const focused = (e.currentTarget as HTMLElement).querySelector('input:focus') as HTMLElement | null;
    if (focused) focused.blur();

    const dragData: DragData = {
      playerId,
      source: { type: 'court', assignmentId: assignment.id, team, index: playerIndex },
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
    onDragStart(dragData);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLLIElement>) => {
    e.preventDefault();
    onDragOverSlot(assignment.id, team, playerIndex);
  };

  const handleDrop = (e: React.DragEvent<HTMLLIElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    // Deserialize to validate it's proper DragData
    JSON.parse(raw) as DragData;
    onDrop(assignment.id, team, playerIndex);
  };

  const classNames = [
    'player-slot',
    isConflict ? 'conflict' : '',
    isDragOver ? 'drag-over' : '',
    isDragging ? 'dragging' : '',
  ].filter(Boolean).join(' ');

  return (
    <li
      className={classNames}
      draggable={!disabled}
      onMouseDown={handleMouseDown}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={onDragLeave}
    >
      {children}
    </li>
  );
};

export default DraggablePlayerSlot;
