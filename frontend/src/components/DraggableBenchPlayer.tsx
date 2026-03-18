import React, { useState } from 'react';
import { Player } from '../types';
import { DragData } from './dragTypes';

interface DraggableBenchPlayerProps {
  player: Player;
  byeCount: number;
  onDragStart: (data: DragData) => void;
  disabled: boolean;
}

const DraggableBenchPlayer: React.FC<DraggableBenchPlayerProps> = ({
  player,
  byeCount,
  onDragStart,
  disabled,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent<HTMLLIElement>) => {
    const dragData: DragData = {
      playerId: player.id,
      source: { type: 'bench' },
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
    onDragStart(dragData);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const classNames = [
    isDragging ? 'dragging' : '',
  ].filter(Boolean).join(' ') || undefined;

  return (
    <li
      className={classNames}
      draggable={!disabled}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{ cursor: disabled ? 'default' : 'grab' }}
    >
      {player.name}
      {byeCount > 0 && (
        <span className="bye-count">({byeCount} {byeCount === 1 ? 'bye' : 'byes'})</span>
      )}
    </li>
  );
};

export default DraggableBenchPlayer;
