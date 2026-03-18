export interface DragData {
  playerId: string;
  source:
    | { type: 'court'; assignmentId: string; team: 'team1' | 'team2'; index: number }
    | { type: 'bench' };
}

export interface DropTarget {
  assignmentId: string;
  team: 'team1' | 'team2';
  index: number;
}
