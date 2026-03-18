import { render, screen, fireEvent, act } from '@testing-library/react';
import RoundDisplay from '../RoundDisplay';
import { Round, Assignment, Court, Player } from '../../types';

// Helper to create a DataTransfer-like object for drag events
function createDragEvent(_type: string, data?: string) {
  const dataStore: Record<string, string> = {};
  if (data) dataStore['application/json'] = data;
  return {
    dataTransfer: {
      setData: (format: string, val: string) => { dataStore[format] = val; },
      getData: (format: string) => dataStore[format] || '',
      effectAllowed: 'move',
    },
    preventDefault: jest.fn(),
  };
}

function dragAndDrop(source: HTMLElement, target: HTMLElement, dragData: string) {
  fireEvent.dragStart(source, createDragEvent('dragstart', dragData));
  fireEvent.dragOver(target, createDragEvent('dragover'));
  fireEvent.drop(target, createDragEvent('drop', dragData));
}

const mockRound: Round = {
  id: 'round1',
  leagueId: 'league1',
  roundNumber: 1,
  createdAt: new Date(),
};

const mockCourts: Court[] = [
  { id: 'court1', leagueId: 'league1', identifier: 'Court 1', createdAt: new Date() },
  { id: 'court2', leagueId: 'league1', identifier: 'Court 2', createdAt: new Date() },
];

const mockPlayers: Player[] = [
  { id: 'p1', leagueId: 'league1', name: 'Alice', createdAt: new Date() },
  { id: 'p2', leagueId: 'league1', name: 'Bob', createdAt: new Date() },
  { id: 'p3', leagueId: 'league1', name: 'Charlie', createdAt: new Date() },
  { id: 'p4', leagueId: 'league1', name: 'Diana', createdAt: new Date() },
  { id: 'p5', leagueId: 'league1', name: 'Eve', createdAt: new Date() },
  { id: 'p6', leagueId: 'league1', name: 'Frank', createdAt: new Date() },
];

const singleCourtAssignments: Assignment[] = [
  {
    id: 'a1',
    roundId: 'round1',
    courtId: 'court1',
    team1PlayerIds: ['p1', 'p2'],
    team2PlayerIds: ['p3', 'p4'],
    createdAt: new Date(),
  },
];

const twoCourtAssignments: Assignment[] = [
  {
    id: 'a1',
    roundId: 'round1',
    courtId: 'court1',
    team1PlayerIds: ['p1', 'p2'],
    team2PlayerIds: ['p3', 'p4'],
    createdAt: new Date(),
  },
  {
    id: 'a2',
    roundId: 'round1',
    courtId: 'court2',
    team1PlayerIds: ['p5'],
    team2PlayerIds: [],
    createdAt: new Date(),
  },
];

const mockOnUpdate = jest.fn().mockResolvedValue(undefined);

function renderEditable(assignmentsOverride?: Assignment[], onUpdate?: jest.Mock) {
  return render(
    <RoundDisplay
      round={mockRound}
      assignments={assignmentsOverride || singleCourtAssignments}
      courts={mockCourts}
      players={mockPlayers}
      onUpdateAssignments={onUpdate || mockOnUpdate}
    />
  );
}

function renderReadOnly() {
  return render(
    <RoundDisplay
      round={mockRound}
      assignments={singleCourtAssignments}
      courts={mockCourts}
      players={mockPlayers}
    />
  );
}

function renderTwoCourts(onUpdate?: jest.Mock) {
  return render(
    <RoundDisplay
      round={mockRound}
      assignments={twoCourtAssignments}
      courts={mockCourts}
      players={mockPlayers}
      onUpdateAssignments={onUpdate || mockOnUpdate}
    />
  );
}

function getBenchSection() {
  return screen.getByText('🪑 On Bench').closest('.players-waiting')!;
}

function getBenchPlayerNames(): string[] {
  const bench = getBenchSection();
  return Array.from(bench.querySelectorAll('li')).map(li => li.textContent || '');
}

function findBenchItem(name: string): HTMLElement {
  const bench = getBenchSection();
  return Array.from(bench.querySelectorAll('li')).find(
    li => li.textContent?.includes(name)
  )! as HTMLElement;
}

// ============================================================
// Unit tests for drag-and-drop logic (Task 2.5)
// ============================================================
describe('RoundDisplay drag-and-drop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('bench → slot drop', () => {
    it('should replace target slot player with bench player after drop', () => {
      // p5 and p6 are on bench (not assigned). singleCourtAssignments has p1-p4.
      renderEditable();

      const playerSlots = screen.getAllByRole('listitem');
      const targetSlot = playerSlots[0]; // p1's slot

      const benchDragData = JSON.stringify({
        playerId: 'p5',
        source: { type: 'bench' },
      });

      const benchItem = findBenchItem('Eve');
      dragAndDrop(benchItem, targetSlot, benchDragData);

      expect(screen.getByText('Save Changes')).toBeInTheDocument();
      const inputs = screen.getAllByPlaceholderText('Type player name...');
      expect((inputs[0] as HTMLInputElement).value).toBe('Eve');
    });
  });

  describe('slot → slot swap', () => {
    it('should swap two player IDs after court-to-court drop', () => {
      renderEditable();

      const courtDragData = JSON.stringify({
        playerId: 'p1',
        source: { type: 'court', assignmentId: 'a1', team: 'team1', index: 0 },
      });

      const playerSlots = screen.getAllByRole('listitem');
      dragAndDrop(playerSlots[0], playerSlots[2], courtDragData);

      expect(screen.getByText('Save Changes')).toBeInTheDocument();
      const inputs = screen.getAllByPlaceholderText('Type player name...');
      expect((inputs[0] as HTMLInputElement).value).toBe('Charlie');
      expect((inputs[2] as HTMLInputElement).value).toBe('Alice');
    });
  });

  describe('same-slot drop', () => {
    it('should not change state when dropping on the same slot', () => {
      renderEditable();

      const courtDragData = JSON.stringify({
        playerId: 'p1',
        source: { type: 'court', assignmentId: 'a1', team: 'team1', index: 0 },
      });

      const playerSlots = screen.getAllByRole('listitem');
      dragAndDrop(playerSlots[0], playerSlots[0], courtDragData);

      expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();
    });
  });

  describe('drop while saving', () => {
    it('should ignore drops when isSaving is true', async () => {
      let resolveUpdate: () => void;
      const slowUpdate = jest.fn(() => new Promise<void>(r => { resolveUpdate = r; }));

      renderEditable(singleCourtAssignments, slowUpdate);

      const benchDragData = JSON.stringify({ playerId: 'p5', source: { type: 'bench' } });
      const playerSlots = screen.getAllByRole('listitem');
      dragAndDrop(findBenchItem('Eve'), playerSlots[0], benchDragData);

      const saveButton = screen.getByText('Save Changes');
      await act(async () => { fireEvent.click(saveButton); });

      // isSaving is true — try another drop
      const anotherDragData = JSON.stringify({
        playerId: 'p3',
        source: { type: 'court', assignmentId: 'a1', team: 'team2', index: 0 },
      });
      const slotsAfterSave = screen.getAllByRole('listitem');
      dragAndDrop(slotsAfterSave[2], slotsAfterSave[1], anotherDragData);

      const inputsAfter = screen.getAllByPlaceholderText('Type player name...');
      expect((inputsAfter[0] as HTMLInputElement).value).toBe('Eve');

      await act(async () => { resolveUpdate!(); });
    });
  });

  describe('hasUnsavedChanges after valid drop', () => {
    it('should set hasUnsavedChanges to true after bench drop', () => {
      renderEditable();
      const benchDragData = JSON.stringify({ playerId: 'p5', source: { type: 'bench' } });
      const playerSlots = screen.getAllByRole('listitem');
      dragAndDrop(findBenchItem('Eve'), playerSlots[0], benchDragData);

      expect(screen.getByText('Save Changes')).toBeInTheDocument();
      expect(screen.getByText('Discard')).toBeInTheDocument();
    });
  });

  describe('drag state cleanup', () => {
    it('should clear dragData and dropTarget after drop', () => {
      renderEditable();
      const benchDragData = JSON.stringify({ playerId: 'p5', source: { type: 'bench' } });
      const playerSlots = screen.getAllByRole('listitem');
      fireEvent.dragStart(findBenchItem('Eve'), createDragEvent('dragstart', benchDragData));
      fireEvent.dragOver(playerSlots[0], createDragEvent('dragover'));
      fireEvent.drop(playerSlots[0], createDragEvent('drop', benchDragData));

      expect(document.querySelectorAll('.drag-over').length).toBe(0);
    });

    it('should clear drag state on dragend', () => {
      renderEditable();
      const courtDragData = JSON.stringify({
        playerId: 'p1',
        source: { type: 'court', assignmentId: 'a1', team: 'team1', index: 0 },
      });
      const playerSlots = screen.getAllByRole('listitem');
      fireEvent.dragStart(playerSlots[0], createDragEvent('dragstart', courtDragData));
      fireEvent.dragOver(playerSlots[1], createDragEvent('dragover'));

      const container = document.querySelector('.round-display')!;
      fireEvent.dragEnd(container);

      expect(document.querySelectorAll('.drag-over').length).toBe(0);
    });
  });

  describe('read-only mode', () => {
    it('should not render draggable elements when onUpdateAssignments is not provided', () => {
      renderReadOnly();
      expect(document.querySelectorAll('[draggable="true"]').length).toBe(0);
    });
  });
});

// ============================================================
// Integration tests for full drag-and-drop flows (Task 5)
// ============================================================
describe('Integration: drag-and-drop flows', () => {
  let onUpdate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    onUpdate = jest.fn().mockResolvedValue(undefined);
  });

  describe('5.1: bench-to-court flow', () => {
    it('should move bench player into court slot and show replaced player on bench', () => {
      // p6 (Frank) is on bench in twoCourtAssignments
      renderTwoCourts(onUpdate);

      // Frank is on bench
      expect(getBenchPlayerNames().some(n => n.includes('Frank'))).toBe(true);

      const benchDragData = JSON.stringify({ playerId: 'p6', source: { type: 'bench' } });
      const allSlots = screen.getAllByRole('listitem');
      const benchFrank = findBenchItem('Frank');
      // Target: first court slot (Alice, a1 team1 index 0)
      dragAndDrop(benchFrank, allSlots[0], benchDragData);

      // Frank should now be in the court
      const inputs = screen.getAllByPlaceholderText('Type player name...');
      expect((inputs[0] as HTMLInputElement).value).toBe('Frank');

      // Frank should no longer be on bench
      expect(getBenchPlayerNames().some(n => n.includes('Frank'))).toBe(false);

      // Alice (replaced) should now appear on bench
      expect(getBenchPlayerNames().some(n => n.includes('Alice'))).toBe(true);
    });
  });

  describe('5.1: court-to-court swap flow', () => {
    it('should swap players between two different courts', () => {
      renderTwoCourts(onUpdate);

      const inputs = screen.getAllByPlaceholderText('Type player name...');
      // Court 1 Team 1: Alice(0), Bob(1) | Team 2: Charlie(2), Diana(3)
      // Court 2 Team 1: Eve(4)
      expect((inputs[0] as HTMLInputElement).value).toBe('Alice');
      expect((inputs[4] as HTMLInputElement).value).toBe('Eve');

      const courtDragData = JSON.stringify({
        playerId: 'p1',
        source: { type: 'court', assignmentId: 'a1', team: 'team1', index: 0 },
      });

      const allSlots = screen.getAllByRole('listitem');
      dragAndDrop(allSlots[0], allSlots[4], courtDragData);

      const inputsAfter = screen.getAllByPlaceholderText('Type player name...');
      expect((inputsAfter[0] as HTMLInputElement).value).toBe('Eve');
      expect((inputsAfter[4] as HTMLInputElement).value).toBe('Alice');
    });
  });

  describe('5.1: drop → Save', () => {
    it('should persist correct data via onUpdateAssignments after drop and save', async () => {
      renderTwoCourts(onUpdate);

      const benchDragData = JSON.stringify({ playerId: 'p6', source: { type: 'bench' } });
      const allSlots = screen.getAllByRole('listitem');
      dragAndDrop(findBenchItem('Frank'), allSlots[0], benchDragData);

      await act(async () => {
        fireEvent.click(screen.getByText('Save Changes'));
      });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const savedData = onUpdate.mock.calls[0][0];
      const court1Data = savedData.find((a: any) => a.courtId === 'court1');
      expect(court1Data.team1PlayerIds[0]).toBe('p6'); // Frank replaced Alice
      expect(court1Data.team1PlayerIds[1]).toBe('p2'); // Bob unchanged
      expect(court1Data.team2PlayerIds).toEqual(['p3', 'p4']); // team2 unchanged
    });
  });

  describe('5.1: drop → Discard', () => {
    it('should revert all assignments to original state after discard', () => {
      renderTwoCourts(onUpdate);

      const benchDragData = JSON.stringify({ playerId: 'p6', source: { type: 'bench' } });
      const allSlots = screen.getAllByRole('listitem');
      dragAndDrop(findBenchItem('Frank'), allSlots[0], benchDragData);

      // Verify change happened
      expect((screen.getAllByPlaceholderText('Type player name...')[0] as HTMLInputElement).value).toBe('Frank');

      fireEvent.click(screen.getByText('Discard'));

      // Alice should be back
      expect((screen.getAllByPlaceholderText('Type player name...')[0] as HTMLInputElement).value).toBe('Alice');
      // Save bar gone
      expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();
      expect(screen.queryByText('Discard')).not.toBeInTheDocument();
      // Frank back on bench
      expect(getBenchPlayerNames().some(n => n.includes('Frank'))).toBe(true);
    });
  });

  describe('5.1: conflict detection after drag', () => {
    it('should detect cross-court conflict and disable save, then resolve via drag', () => {
      // p1 appears on both courts — cross-court conflict triggers "is also on" warning
      const conflictAssignments: Assignment[] = [
        {
          id: 'a1',
          roundId: 'round1',
          courtId: 'court1',
          team1PlayerIds: ['p1', 'p2'],
          team2PlayerIds: ['p3', 'p4'],
          createdAt: new Date(),
        },
        {
          id: 'a2',
          roundId: 'round1',
          courtId: 'court2',
          team1PlayerIds: ['p1'],
          team2PlayerIds: [],
          createdAt: new Date(),
        },
      ];

      render(
        <RoundDisplay
          round={mockRound}
          assignments={conflictAssignments}
          courts={mockCourts}
          players={mockPlayers}
          onUpdateAssignments={onUpdate}
        />
      );

      // Conflict should be detected — "is also on" warning for cross-court duplicate
      expect(screen.queryAllByText(/is also on/).length).toBeGreaterThan(0);
      // Conflict slots should have the conflict class
      expect(document.querySelectorAll('.conflict').length).toBeGreaterThan(0);
      // No save bar yet (no unsaved changes — this is the initial state)
      expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();

      // Fix the conflict: drop Eve (bench) onto the duplicate p1 slot on court2
      const benchDragData = JSON.stringify({ playerId: 'p5', source: { type: 'bench' } });
      const allSlots = screen.getAllByRole('listitem');
      // Court 1: team1=[p1(0), p2(1)], team2=[p3(2), p4(3)]
      // Court 2: team1=[p1(4)]
      // Bench: p5(Eve), p6(Frank)
      dragAndDrop(findBenchItem('Eve'), allSlots[4], benchDragData);

      // After replacing the duplicate p1 with Eve, conflict should be resolved
      expect(screen.queryAllByText(/is also on/).length).toBe(0);
      expect(document.querySelectorAll('.conflict').length).toBe(0);
      // Save should now be enabled (unsaved changes, no conflicts)
      expect(screen.getByText('Save Changes')).not.toBeDisabled();
    });

    it('should show conflict slots with conflict class after drag creates duplicate via typeahead', () => {
      render(
        <RoundDisplay
          round={mockRound}
          assignments={singleCourtAssignments}
          courts={mockCourts}
          players={mockPlayers}
          onUpdateAssignments={onUpdate}
        />
      );

      // Drop Eve (p5) onto Alice's slot (team1 index 0)
      const benchDragData = JSON.stringify({ playerId: 'p5', source: { type: 'bench' } });
      const allSlots = screen.getAllByRole('listitem');
      dragAndDrop(findBenchItem('Eve'), allSlots[0], benchDragData);

      // Eve is now in team1[0]. Use typeahead to put Eve in team2[0] too.
      const inputs = screen.getAllByPlaceholderText('Type player name...');
      const charlieInput = inputs[2]; // team2 index 0

      // Open suggestions and select Eve
      fireEvent.focus(charlieInput);
      fireEvent.change(charlieInput, { target: { value: 'Eve' } });

      // Find the Eve suggestion in the dropdown and click it
      const suggestionDivs = document.querySelectorAll('.player-suggestion');
      const eveSuggestion = Array.from(suggestionDivs).find(
        div => div.textContent?.includes('Eve')
      );
      if (eveSuggestion) {
        fireEvent.mouseDown(eveSuggestion);
      }

      // Check for conflict indicators
      const conflictSlots = document.querySelectorAll('.conflict');
      expect(conflictSlots.length).toBeGreaterThan(0);
    });
  });

  describe('5.2: read-only mode', () => {
    it('should not render any draggable elements without onUpdateAssignments', () => {
      renderReadOnly();
      const draggableElements = document.querySelectorAll('[draggable="true"]');
      expect(draggableElements.length).toBe(0);
    });

    it('should not render DraggablePlayerSlot or DraggableBenchPlayer in read-only mode', () => {
      renderReadOnly();
      // In read-only mode, player slots are plain <li> without draggable attribute
      const allItems = screen.getAllByRole('listitem');
      allItems.forEach(item => {
        expect(item.getAttribute('draggable')).not.toBe('true');
      });
    });

    it('should still display player names and bench in read-only mode', () => {
      renderReadOnly();
      // Court players visible
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      // Bench players visible
      expect(screen.getByText('Eve')).toBeInTheDocument();
      expect(screen.getByText('Frank')).toBeInTheDocument();
    });
  });
});
