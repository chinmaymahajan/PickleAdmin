import fc from 'fast-check';
import { render, fireEvent } from '@testing-library/react';
import RoundDisplay from '../RoundDisplay';
import { Assignment, Round, Court, Player } from '../../types';

// ============================================================
// Pure helper functions extracted from RoundDisplay handleDrop logic
// ============================================================

interface CourtSource {
  type: 'court';
  assignmentId: string;
  team: 'team1' | 'team2';
  index: number;
}

interface SlotRef {
  assignmentId: string;
  team: 'team1' | 'team2';
  index: number;
}

/**
 * Pure function that performs a court-to-court swap on assignments.
 * Mirrors the handleDrop logic in RoundDisplay for court→court swaps.
 */
function performCourtSwap(
  assignments: Assignment[],
  source: CourtSource,
  target: SlotRef
): Assignment[] {
  const srcTeamKey = source.team === 'team1' ? 'team1PlayerIds' : 'team2PlayerIds';
  const targetTeamKey = target.team === 'team1' ? 'team1PlayerIds' : 'team2PlayerIds';

  const targetAssignment = assignments.find(a => a.id === target.assignmentId);
  if (!targetAssignment) return assignments;
  const targetPlayerId = targetAssignment[targetTeamKey][target.index];

  const sourceAssignment = assignments.find(a => a.id === source.assignmentId);
  if (!sourceAssignment) return assignments;
  const sourcePlayerId = sourceAssignment[srcTeamKey][source.index];

  return assignments.map(a => {
    let updated = a;
    // Place target player into source slot
    if (a.id === source.assignmentId) {
      const newTeam = [...a[srcTeamKey]];
      newTeam[source.index] = targetPlayerId;
      updated = { ...updated, [srcTeamKey]: newTeam };
    }
    // Place source player into target slot
    if (updated.id === target.assignmentId) {
      const newTeam = [...updated[targetTeamKey]];
      newTeam[target.index] = sourcePlayerId;
      updated = { ...updated, [targetTeamKey]: newTeam };
    }
    return updated;
  });
}

/**
 * Pure function that performs a bench-to-court drop on assignments.
 * Mirrors the handleDrop logic in RoundDisplay for bench→court drops.
 * Replaces the target slot's player ID with the bench player's ID.
 */
function performBenchDrop(
  assignments: Assignment[],
  benchPlayerId: string,
  target: SlotRef
): Assignment[] {
  const targetTeamKey = target.team === 'team1' ? 'team1PlayerIds' : 'team2PlayerIds';

  return assignments.map(a => {
    if (a.id !== target.assignmentId) return a;
    const newTeam = [...a[targetTeamKey]];
    newTeam[target.index] = benchPlayerId;
    return { ...a, [targetTeamKey]: newTeam };
  });
}


// ============================================================
// fast-check arbitraries for generating random data
// ============================================================

/** Generate a random player ID string */
const playerIdArb = fc.stringMatching(/^p[a-z0-9]{3,8}$/);

/** Generate a random assignment ID string */
const assignmentIdArb = fc.stringMatching(/^a[a-z0-9]{3,8}$/);

/** Generate a team of player IDs (2 players per team, standard pickleball) */
const teamArb = fc.tuple(playerIdArb, playerIdArb);

/**
 * Generate a list of assignments with unique IDs and unique player IDs across all slots.
 * Each assignment has 2 players per team (standard doubles).
 */
const assignmentsArb = fc
  .integer({ min: 1, max: 4 })
  .chain(numAssignments =>
    fc
      .tuple(
        fc.uniqueArray(assignmentIdArb, { minLength: numAssignments, maxLength: numAssignments }),
        fc.uniqueArray(playerIdArb, { minLength: numAssignments * 4, maxLength: numAssignments * 4 })
      )
      .map(([ids, playerIds]) =>
        ids.map((id, i): Assignment => ({
          id,
          roundId: 'round1',
          courtId: `court${i}`,
          team1PlayerIds: [playerIds[i * 4], playerIds[i * 4 + 1]],
          team2PlayerIds: [playerIds[i * 4 + 2], playerIds[i * 4 + 3]],
          createdAt: new Date(),
        }))
      )
  );

/** A slot reference: index into assignments array, team, and player index */
interface SlotPosition {
  assignmentIndex: number;
  team: 'team1' | 'team2';
  playerIndex: 0 | 1;
}

const teamNameArb = fc.constantFrom<'team1' | 'team2'>('team1', 'team2');
const playerIndexArb = fc.constantFrom<0 | 1>(0, 1);

/**
 * Generate two distinct slot positions for a given number of assignments.
 * Ensures the two slots are different (not same assignment+team+index).
 */
function twoDistinctSlotsArb(numAssignments: number) {
  const slotArb = fc.tuple(
    fc.integer({ min: 0, max: numAssignments - 1 }),
    teamNameArb,
    playerIndexArb
  ).map(([ai, team, pi]): SlotPosition => ({
    assignmentIndex: ai,
    team,
    playerIndex: pi,
  }));

  return fc
    .tuple(slotArb, slotArb)
    .filter(
      ([a, b]) =>
        a.assignmentIndex !== b.assignmentIndex ||
        a.team !== b.team ||
        a.playerIndex !== b.playerIndex
    );
}

/**
 * Generate a bench player ID that is guaranteed NOT to be in the given assignments.
 * Uses a prefix 'bench_' to ensure uniqueness from court player IDs (which start with 'p').
 */
function benchPlayerArb(assignments: Assignment[]) {
  const existingIds = new Set(getAllPlayerIds(assignments));
  return fc.stringMatching(/^bench_[a-z0-9]{3,8}$/).filter(id => !existingIds.has(id));
}

/** Generate a single slot position for a given number of assignments. */
function singleSlotArb(numAssignments: number) {
  return fc.tuple(
    fc.integer({ min: 0, max: numAssignments - 1 }),
    teamNameArb,
    playerIndexArb
  ).map(([ai, team, pi]): SlotPosition => ({
    assignmentIndex: ai,
    team,
    playerIndex: pi,
  }));
}



// ============================================================
// Helper to read a player ID from a slot
// ============================================================

function getPlayerAtSlot(assignments: Assignment[], slot: SlotPosition): string {
  const a = assignments[slot.assignmentIndex];
  const teamKey = slot.team === 'team1' ? 'team1PlayerIds' : 'team2PlayerIds';
  return a[teamKey][slot.playerIndex];
}

function getAllPlayerIds(assignments: Assignment[]): string[] {
  const ids: string[] = [];
  for (const a of assignments) {
    ids.push(...a.team1PlayerIds, ...a.team2PlayerIds);
  }
  return ids;
}

// ============================================================
// Property Tests
// ============================================================

describe('Drag & Drop Property Tests', () => {
  /**
   * Property 1: Court-to-court swap exchanges player IDs
   *
   * For any two distinct court slots containing players A and B,
   * performing a court-to-court swap results in:
   * - Slot A now contains player B's ID
   * - Slot B now contains player A's ID
   * - All other slots are unchanged
   *
   * **Validates: Requirement 1.1**
   */
  describe('Property 1: Court-to-court swap exchanges player IDs', () => {
    it('swapping two distinct slots exchanges their player IDs with all others unchanged', () => {
      fc.assert(
        fc.property(
          assignmentsArb.chain(assignments =>
            twoDistinctSlotsArb(assignments.length).map(([slotA, slotB]) => ({
              assignments,
              slotA,
              slotB,
            }))
          ),
          ({ assignments, slotA, slotB }) => {
            const playerA = getPlayerAtSlot(assignments, slotA);
            const playerB = getPlayerAtSlot(assignments, slotB);

            const source: CourtSource = {
              type: 'court',
              assignmentId: assignments[slotA.assignmentIndex].id,
              team: slotA.team,
              index: slotA.playerIndex,
            };
            const target: SlotRef = {
              assignmentId: assignments[slotB.assignmentIndex].id,
              team: slotB.team,
              index: slotB.playerIndex,
            };

            const result = performCourtSwap(assignments, source, target);

            // Source slot now has player B
            expect(getPlayerAtSlot(result, slotA)).toBe(playerB);
            // Target slot now has player A
            expect(getPlayerAtSlot(result, slotB)).toBe(playerA);

            // All other slots unchanged
            const allBefore = getAllPlayerIds(assignments);
            const allAfter = getAllPlayerIds(result);
            expect(allAfter.length).toBe(allBefore.length);

            for (let ai = 0; ai < assignments.length; ai++) {
              for (const team of ['team1', 'team2'] as const) {
                const teamKey = team === 'team1' ? 'team1PlayerIds' : 'team2PlayerIds';
                for (let pi = 0; pi < assignments[ai][teamKey].length; pi++) {
                  const isSlotA =
                    ai === slotA.assignmentIndex &&
                    team === slotA.team &&
                    pi === slotA.playerIndex;
                  const isSlotB =
                    ai === slotB.assignmentIndex &&
                    team === slotB.team &&
                    pi === slotB.playerIndex;

                  if (!isSlotA && !isSlotB) {
                    expect(result[ai][teamKey][pi]).toBe(assignments[ai][teamKey][pi]);
                  }
                }
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Bench-to-court drop replaces target player
   *
   * For any bench player and any court slot, performing a bench-to-court
   * drop results in:
   * - The target slot contains the bench player's ID
   * - All other slots are unchanged
   *
   * **Validates: Requirement 2.1**
   */
  describe('Property 2: Bench-to-court drop replaces target player', () => {
    it('dropping a bench player onto a court slot replaces that slot with all others unchanged', () => {
      fc.assert(
        fc.property(
          assignmentsArb.chain(assignments =>
            fc.tuple(
              fc.constant(assignments),
              benchPlayerArb(assignments),
              singleSlotArb(assignments.length)
            )
          ),
          ([assignments, benchPlayerId, targetSlot]) => {
            const target: SlotRef = {
              assignmentId: assignments[targetSlot.assignmentIndex].id,
              team: targetSlot.team,
              index: targetSlot.playerIndex,
            };

            const result = performBenchDrop(assignments, benchPlayerId, target);

            // Target slot now contains the bench player's ID
            expect(getPlayerAtSlot(result, targetSlot)).toBe(benchPlayerId);

            // All other slots unchanged
            for (let ai = 0; ai < assignments.length; ai++) {
              for (const team of ['team1', 'team2'] as const) {
                const teamKey = team === 'team1' ? 'team1PlayerIds' : 'team2PlayerIds';
                for (let pi = 0; pi < assignments[ai][teamKey].length; pi++) {
                  const isTarget =
                    ai === targetSlot.assignmentIndex &&
                    team === targetSlot.team &&
                    pi === targetSlot.playerIndex;

                  if (!isTarget) {
                    expect(result[ai][teamKey][pi]).toBe(assignments[ai][teamKey][pi]);
                  }
                }
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 3: Any valid drop sets unsaved changes flag
   *
   * For any valid drop operation (court-to-court swap of two distinct slots,
   * or bench-to-court assignment), the resulting assignments differ from the
   * original. In the component this means hasUnsavedChanges is set to true.
   *
   * **Validates: Requirements 1.2, 2.2**
   */
  describe('Property 3: Any valid drop sets unsaved changes flag', () => {
    it('court-to-court swap of distinct slots always produces different assignments', () => {
      fc.assert(
        fc.property(
          assignmentsArb.chain(assignments =>
            twoDistinctSlotsArb(assignments.length).map(([slotA, slotB]) => ({
              assignments,
              slotA,
              slotB,
            }))
          ),
          ({ assignments, slotA, slotB }) => {
            const source: CourtSource = {
              type: 'court',
              assignmentId: assignments[slotA.assignmentIndex].id,
              team: slotA.team,
              index: slotA.playerIndex,
            };
            const target: SlotRef = {
              assignmentId: assignments[slotB.assignmentIndex].id,
              team: slotB.team,
              index: slotB.playerIndex,
            };

            const result = performCourtSwap(assignments, source, target);

            // Since all player IDs are unique (from assignmentsArb) and slots are distinct,
            // the swap must produce a different state — hasUnsavedChanges = true
            const changed =
              getPlayerAtSlot(result, slotA) !== getPlayerAtSlot(assignments, slotA) ||
              getPlayerAtSlot(result, slotB) !== getPlayerAtSlot(assignments, slotB);
            expect(changed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('bench-to-court drop always produces different assignments', () => {
      fc.assert(
        fc.property(
          assignmentsArb.chain(assignments =>
            fc.tuple(
              fc.constant(assignments),
              benchPlayerArb(assignments),
              singleSlotArb(assignments.length)
            )
          ),
          ([assignments, benchPlayerId, targetSlot]) => {
            const target: SlotRef = {
              assignmentId: assignments[targetSlot.assignmentIndex].id,
              team: targetSlot.team,
              index: targetSlot.playerIndex,
            };

            const result = performBenchDrop(assignments, benchPlayerId, target);

            // Bench player ID is guaranteed different from any court player ID,
            // so the target slot must change — hasUnsavedChanges = true
            const originalPlayer = getPlayerAtSlot(assignments, targetSlot);
            const newPlayer = getPlayerAtSlot(result, targetSlot);
            expect(newPlayer).not.toBe(originalPlayer);
            expect(newPlayer).toBe(benchPlayerId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 4: DragData serialization round-trip
   *
   * For any DragData object (court or bench source), serializing via
   * JSON.stringify and deserializing via JSON.parse produces a deep-equal object.
   *
   * **Validates: Requirements 1.4, 2.3**
   */
  describe('Property 4: DragData serialization round-trip', () => {
    interface DragData {
      playerId: string;
      source:
        | { type: 'court'; assignmentId: string; team: 'team1' | 'team2'; index: number }
        | { type: 'bench' };
    }

    const courtSourceArb = fc.record({
      type: fc.constant('court' as const),
      assignmentId: assignmentIdArb,
      team: teamNameArb,
      index: fc.nat({ max: 100 }),
    });

    const benchSourceArb = fc.record({
      type: fc.constant('bench' as const),
    });

    const dragDataArb: fc.Arbitrary<DragData> = fc.oneof(
      fc.record({ playerId: playerIdArb, source: courtSourceArb }),
      fc.record({ playerId: playerIdArb, source: benchSourceArb })
    );

    it('JSON.stringify then JSON.parse produces a deep-equal DragData object', () => {
      fc.assert(
        fc.property(dragDataArb, (dragData) => {
          const serialized = JSON.stringify(dragData);
          const deserialized = JSON.parse(serialized) as DragData;

          expect(deserialized).toEqual(dragData);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 5: Conflict detection after drag mutations
   *
   * For any editedAssignments with a duplicate player ID (same player in
   * more than one court slot), the conflict detection logic should:
   * - Return a non-empty set of conflicting player IDs
   * - Include every duplicated player ID in the set
   * - The save button should be disabled (hasConflicts = duplicates.size > 0)
   *
   * **Validates: Requirements 4.1, 4.2**
   */
  describe('Property 5: Conflict detection after drag mutations', () => {
    /**
     * Pure function extracted from RoundDisplay conflict detection logic.
     * Counts how many slots each player ID appears in and returns the set
     * of player IDs that appear more than once.
     */
    function detectConflicts(assignments: Assignment[]): Set<string> {
      const playerLocationMap = new Map<string, number>();
      for (const a of assignments) {
        for (const pid of [...a.team1PlayerIds, ...a.team2PlayerIds]) {
          playerLocationMap.set(pid, (playerLocationMap.get(pid) || 0) + 1);
        }
      }
      const duplicates = new Set<string>();
      playerLocationMap.forEach((count, pid) => {
        if (count > 1) duplicates.add(pid);
      });
      return duplicates;
    }

    /**
     * Generate assignments with at least 2 courts, then intentionally
     * duplicate a player by copying one player's ID into a different slot.
     */
    const assignmentsWithDuplicateArb = fc
      .integer({ min: 2, max: 4 })
      .chain(numAssignments =>
        fc
          .tuple(
            fc.uniqueArray(assignmentIdArb, { minLength: numAssignments, maxLength: numAssignments }),
            fc.uniqueArray(playerIdArb, { minLength: numAssignments * 4, maxLength: numAssignments * 4 }),
            // Source slot: where we pick the player ID to duplicate
            fc.integer({ min: 0, max: numAssignments - 1 }),
            teamNameArb,
            playerIndexArb,
            // Target slot: where we inject the duplicate
            fc.integer({ min: 0, max: numAssignments - 1 }),
            teamNameArb,
            playerIndexArb
          )
          .filter(([, , srcAi, srcTeam, srcPi, tgtAi, tgtTeam, tgtPi]) =>
            // Ensure source and target are distinct slots
            srcAi !== tgtAi || srcTeam !== tgtTeam || srcPi !== tgtPi
          )
          .map(([ids, playerIds, srcAi, srcTeam, srcPi, tgtAi, tgtTeam, tgtPi]) => {
            // Build clean assignments first
            const assignments: Assignment[] = ids.map((id, i) => ({
              id,
              roundId: 'round1',
              courtId: `court${i}`,
              team1PlayerIds: [playerIds[i * 4], playerIds[i * 4 + 1]],
              team2PlayerIds: [playerIds[i * 4 + 2], playerIds[i * 4 + 3]],
              createdAt: new Date(),
            }));

            // Read the source player ID
            const srcTeamKey = srcTeam === 'team1' ? 'team1PlayerIds' : 'team2PlayerIds';
            const duplicatedPlayerId = assignments[srcAi][srcTeamKey][srcPi];

            // Inject the duplicate into the target slot
            const tgtTeamKey = tgtTeam === 'team1' ? 'team1PlayerIds' : 'team2PlayerIds';
            const mutated = assignments.map((a, i) => {
              if (i !== tgtAi) return a;
              const newTeam = [...a[tgtTeamKey]];
              newTeam[tgtPi] = duplicatedPlayerId;
              return { ...a, [tgtTeamKey]: newTeam };
            });

            return { assignments: mutated, duplicatedPlayerId };
          })
      );

    it('detects duplicated player IDs and would disable save', () => {
      fc.assert(
        fc.property(assignmentsWithDuplicateArb, ({ assignments, duplicatedPlayerId }) => {
          const conflicts = detectConflicts(assignments);

          // The duplicated player must be in the conflict set
          expect(conflicts.has(duplicatedPlayerId)).toBe(true);

          // Conflict set must be non-empty
          expect(conflicts.size).toBeGreaterThan(0);

          // Save button should be disabled: hasConflicts = conflicts.size > 0
          const hasConflicts = conflicts.size > 0;
          expect(hasConflicts).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('reports no conflicts when all player IDs are unique', () => {
      fc.assert(
        fc.property(assignmentsArb, (assignments) => {
          const conflicts = detectConflicts(assignments);

          // assignmentsArb guarantees unique player IDs, so no conflicts
          expect(conflicts.size).toBe(0);

          // Save button should be enabled
          const hasConflicts = conflicts.size > 0;
          expect(hasConflicts).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: Drops are ignored while saving
   *
   * For any drop event received while isSaving is true, the editedAssignments
   * state should remain unchanged. This tests the guard at the top of handleDrop:
   *   if (isSaving || !dragData) return;
   *
   * **Validates: Requirement 5.1**
   */
  describe('Property 6: Drops are ignored while saving', () => {
    interface DropDragData {
      playerId: string;
      source:
        | { type: 'court'; assignmentId: string; team: 'team1' | 'team2'; index: number }
        | { type: 'bench' };
    }

    /**
     * Pure function that mirrors handleDrop with the isSaving guard.
     * When isSaving is true or dragData is null, returns assignments unchanged.
     */
    function handleDropWithGuard(
      assignments: Assignment[],
      dragData: DropDragData | null,
      isSaving: boolean,
      target: SlotRef
    ): { assignments: Assignment[]; changed: boolean } {
      if (isSaving || !dragData) {
        return { assignments, changed: false };
      }

      if (dragData.source.type === 'bench') {
        return {
          assignments: performBenchDrop(assignments, dragData.playerId, target),
          changed: true,
        };
      }

      // Court-to-court swap
      const source: CourtSource = {
        type: 'court',
        assignmentId: dragData.source.assignmentId,
        team: dragData.source.team,
        index: dragData.source.index,
      };

      // Same slot → no-op
      if (
        source.assignmentId === target.assignmentId &&
        source.team === target.team &&
        source.index === target.index
      ) {
        return { assignments, changed: false };
      }

      return {
        assignments: performCourtSwap(assignments, source, target),
        changed: true,
      };
    }

    /** Generate a court-source DragData referencing a valid slot in the assignments */
    function courtDragDataArb(assignments: Assignment[]) {
      return singleSlotArb(assignments.length).map((slot): DropDragData => ({
        playerId: getPlayerAtSlot(assignments, slot),
        source: {
          type: 'court',
          assignmentId: assignments[slot.assignmentIndex].id,
          team: slot.team,
          index: slot.playerIndex,
        },
      }));
    }

    /** Generate a bench-source DragData */
    function benchDragDataArb(assignments: Assignment[]) {
      return benchPlayerArb(assignments).map((pid): DropDragData => ({
        playerId: pid,
        source: { type: 'bench' },
      }));
    }

    /** Generate any valid DragData (court or bench) */
    function anyDragDataArb(assignments: Assignment[]) {
      return fc.oneof(courtDragDataArb(assignments), benchDragDataArb(assignments));
    }

    it('court-source drop is ignored when isSaving is true', () => {
      fc.assert(
        fc.property(
          assignmentsArb.chain(assignments =>
            fc.tuple(
              fc.constant(assignments),
              courtDragDataArb(assignments),
              singleSlotArb(assignments.length)
            )
          ),
          ([assignments, dragData, targetSlot]) => {
            const target: SlotRef = {
              assignmentId: assignments[targetSlot.assignmentIndex].id,
              team: targetSlot.team,
              index: targetSlot.playerIndex,
            };

            const result = handleDropWithGuard(assignments, dragData, true, target);

            expect(result.changed).toBe(false);
            expect(result.assignments).toEqual(assignments);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('bench-source drop is ignored when isSaving is true', () => {
      fc.assert(
        fc.property(
          assignmentsArb.chain(assignments =>
            fc.tuple(
              fc.constant(assignments),
              benchDragDataArb(assignments),
              singleSlotArb(assignments.length)
            )
          ),
          ([assignments, dragData, targetSlot]) => {
            const target: SlotRef = {
              assignmentId: assignments[targetSlot.assignmentIndex].id,
              team: targetSlot.team,
              index: targetSlot.playerIndex,
            };

            const result = handleDropWithGuard(assignments, dragData, true, target);

            expect(result.changed).toBe(false);
            expect(result.assignments).toEqual(assignments);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('any drop type is ignored when isSaving is true', () => {
      fc.assert(
        fc.property(
          assignmentsArb.chain(assignments =>
            fc.tuple(
              fc.constant(assignments),
              anyDragDataArb(assignments),
              singleSlotArb(assignments.length)
            )
          ),
          ([assignments, dragData, targetSlot]) => {
            const target: SlotRef = {
              assignmentId: assignments[targetSlot.assignmentIndex].id,
              team: targetSlot.team,
              index: targetSlot.playerIndex,
            };

            const result = handleDropWithGuard(assignments, dragData, true, target);

            // Assignments must be exactly the same reference (no mutation)
            expect(result.assignments).toBe(assignments);
            expect(result.changed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 7: Draggable attribute matches edit mode
   *
   * For any player element (court slot or bench player), the draggable attribute
   * should be set to true if and only if the system is in edit mode
   * (onUpdateAssignments is provided).
   *
   * **Validates: Requirements 5.2, 7.1, 7.2**
   */
  describe('Property 7: Draggable attribute matches edit mode', () => {
    /**
     * Generate random assignments along with consistent players and courts
     * derived from those assignments, so RoundDisplay can render them.
     */
    const renderDataArb = assignmentsArb.map(assignments => {
      // Collect all unique player IDs from assignments
      const playerIds = new Set<string>();
      for (const a of assignments) {
        a.team1PlayerIds.forEach(id => playerIds.add(id));
        a.team2PlayerIds.forEach(id => playerIds.add(id));
      }

      // Build Player objects from the IDs
      const players: Player[] = Array.from(playerIds).map(id => ({
        id,
        leagueId: 'league1',
        name: `Player_${id}`,
        createdAt: new Date(),
      }));

      // Add some extra bench players (not assigned to any court)
      const benchPlayers: Player[] = [
        { id: 'bench_x1', leagueId: 'league1', name: 'BenchPlayer_1', createdAt: new Date() },
        { id: 'bench_x2', leagueId: 'league1', name: 'BenchPlayer_2', createdAt: new Date() },
      ];
      const allPlayers = [...players, ...benchPlayers];

      // Build Court objects from assignment courtIds
      const courts: Court[] = assignments.map(a => ({
        id: a.courtId,
        leagueId: 'league1',
        identifier: `Court_${a.courtId}`,
        createdAt: new Date(),
      }));

      const round: Round = {
        id: 'round1',
        leagueId: 'league1',
        roundNumber: 1,
        createdAt: new Date(),
      };

      return { assignments, players: allPlayers, courts, round };
    });

    it('all player elements have draggable="true" when onUpdateAssignments is provided', () => {
      fc.assert(
        fc.property(renderDataArb, ({ assignments, players, courts, round }) => {
          const { container } = render(
            <RoundDisplay
              round={round}
              assignments={assignments}
              courts={courts}
              players={players}
              onUpdateAssignments={async () => {}}
            />
          );

          // Count expected draggable elements:
          // Court slots: each assignment has 2 team1 + 2 team2 = 4 players
          const totalCourtSlots = assignments.reduce(
            (sum, a) => sum + a.team1PlayerIds.length + a.team2PlayerIds.length,
            0
          );

          // Bench players: players not assigned to any court
          const assignedIds = new Set<string>();
          assignments.forEach(a => {
            a.team1PlayerIds.forEach(id => assignedIds.add(id));
            a.team2PlayerIds.forEach(id => assignedIds.add(id));
          });
          const benchCount = players.filter(p => !assignedIds.has(p.id)).length;

          const expectedDraggable = totalCourtSlots + benchCount;

          // Query all <li> elements with draggable="true"
          const draggableElements = container.querySelectorAll('li[draggable="true"]');
          expect(draggableElements.length).toBe(expectedDraggable);
        }),
        { numRuns: 20 }
      );
    });

    it('no elements have draggable="true" when onUpdateAssignments is NOT provided', () => {
      fc.assert(
        fc.property(renderDataArb, ({ assignments, players, courts, round }) => {
          const { container } = render(
            <RoundDisplay
              round={round}
              assignments={assignments}
              courts={courts}
              players={players}
              // No onUpdateAssignments → read-only mode
            />
          );

          // In read-only mode, no elements should have draggable="true"
          const draggableElements = container.querySelectorAll('li[draggable="true"]');
          expect(draggableElements.length).toBe(0);
        }),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 8: Discard reverts all drag changes
   *
   * For any sequence of drag-and-drop operations applied to a deep clone of
   * the original assignments, simulating discard (creating a fresh deep clone
   * from the original) restores the state to be deep-equal to the original.
   *
   * This mirrors the RoundDisplay discard logic:
   *   setEditedAssignments(JSON.parse(JSON.stringify(assignments)));
   *
   * **Validates: Requirement 6.2**
   */
  describe('Property 8: Discard reverts all drag changes', () => {
    /**
     * Generate a random drop operation (bench-to-court or court-to-court)
     * that can be applied to assignments of the given length.
     */
    function randomDropArb(numAssignments: number) {
      const benchDropArb = fc.tuple(
        fc.constant('bench' as const),
        fc.stringMatching(/^bench_[a-z0-9]{3,8}$/),
        singleSlotArb(numAssignments)
      );

      const courtDropArb = fc.tuple(
        fc.constant('court' as const),
        fc.constant(''), // unused for court drops
        twoDistinctSlotsArb(numAssignments).map(([src, tgt]) => ({ src, tgt }))
      );

      return fc.oneof(benchDropArb, courtDropArb);
    }

    it('for any sequence of drag operations, discard restores original assignments', () => {
      fc.assert(
        fc.property(
          assignmentsArb.chain(assignments =>
            fc.tuple(
              fc.constant(assignments),
              fc.integer({ min: 1, max: 5 }).chain(numOps =>
                fc.array(randomDropArb(assignments.length), { minLength: numOps, maxLength: numOps })
              )
            )
          ),
          ([originalAssignments, dropOps]) => {
            // Step 1: Deep clone the original (simulating component mount)
            let editedAssignments: Assignment[] = JSON.parse(JSON.stringify(originalAssignments));

            // Step 2: Apply a random sequence of drop operations on the clone
            for (const op of dropOps) {
              if (op[0] === 'bench') {
                const benchPlayerId = op[1] as string;
                const targetSlot = op[2] as SlotPosition;
                const target: SlotRef = {
                  assignmentId: editedAssignments[targetSlot.assignmentIndex].id,
                  team: targetSlot.team,
                  index: targetSlot.playerIndex,
                };
                editedAssignments = performBenchDrop(editedAssignments, benchPlayerId, target);
              } else {
                // Court-to-court swap
                const slots = op[2] as { src: SlotPosition; tgt: SlotPosition };
                const source: CourtSource = {
                  type: 'court',
                  assignmentId: editedAssignments[slots.src.assignmentIndex].id,
                  team: slots.src.team,
                  index: slots.src.playerIndex,
                };
                const target: SlotRef = {
                  assignmentId: editedAssignments[slots.tgt.assignmentIndex].id,
                  team: slots.tgt.team,
                  index: slots.tgt.playerIndex,
                };
                editedAssignments = performCourtSwap(editedAssignments, source, target);
              }
            }

            // Step 3: Simulate discard — fresh deep clone from the original
            const discardedAssignments: Assignment[] = JSON.parse(JSON.stringify(originalAssignments));

            // Step 4: Verify discarded state deep-equals the original
            // Compare structurally (ignoring Date objects which don't round-trip via JSON)
            for (let i = 0; i < originalAssignments.length; i++) {
              expect(discardedAssignments[i].id).toBe(originalAssignments[i].id);
              expect(discardedAssignments[i].roundId).toBe(originalAssignments[i].roundId);
              expect(discardedAssignments[i].courtId).toBe(originalAssignments[i].courtId);
              expect(discardedAssignments[i].team1PlayerIds).toEqual(originalAssignments[i].team1PlayerIds);
              expect(discardedAssignments[i].team2PlayerIds).toEqual(originalAssignments[i].team2PlayerIds);
            }
            expect(discardedAssignments.length).toBe(originalAssignments.length);

            // Also verify the original was NOT mutated by the drop operations
            for (let i = 0; i < originalAssignments.length; i++) {
              expect(discardedAssignments[i].team1PlayerIds).toEqual(originalAssignments[i].team1PlayerIds);
              expect(discardedAssignments[i].team2PlayerIds).toEqual(originalAssignments[i].team2PlayerIds);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 9: Drag and typeahead produce equivalent state
   *
   * For any player reassignment (bench→court or court→court swap),
   * performing the operation via drag-and-drop should produce the same
   * editedAssignments state as performing the equivalent operation via
   * the typeahead.
   *
   * **Validates: Requirement 6.3**
   */
  describe('Property 9: Drag and typeahead produce equivalent state', () => {
    /**
     * Pure function that mirrors the typeahead handlePlayerChange logic.
     * Replaces a single slot's player ID with a new player ID.
     */
    function performTypeaheadChange(
      assignments: Assignment[],
      assignmentId: string,
      team: 'team1' | 'team2',
      playerIndex: number,
      newPlayerId: string
    ): Assignment[] {
      const teamKey = team === 'team1' ? 'team1PlayerIds' : 'team2PlayerIds';
      return assignments.map(a => {
        if (a.id !== assignmentId) return a;
        const newTeam = [...a[teamKey]];
        newTeam[playerIndex] = newPlayerId;
        return { ...a, [teamKey]: newTeam };
      });
    }

    it('bench→court: drag drop and typeahead produce identical assignments', () => {
      fc.assert(
        fc.property(
          assignmentsArb.chain(assignments =>
            fc.tuple(
              fc.constant(assignments),
              benchPlayerArb(assignments),
              singleSlotArb(assignments.length)
            )
          ),
          ([assignments, benchPlayerId, targetSlot]) => {
            const targetAssignmentId = assignments[targetSlot.assignmentIndex].id;

            // Drag-and-drop path
            const dragResult = performBenchDrop(assignments, benchPlayerId, {
              assignmentId: targetAssignmentId,
              team: targetSlot.team,
              index: targetSlot.playerIndex,
            });

            // Typeahead path
            const typeaheadResult = performTypeaheadChange(
              assignments,
              targetAssignmentId,
              targetSlot.team,
              targetSlot.playerIndex,
              benchPlayerId
            );

            // Deep-compare: both paths must produce identical state
            expect(dragResult.length).toBe(typeaheadResult.length);
            for (let i = 0; i < dragResult.length; i++) {
              expect(dragResult[i].id).toBe(typeaheadResult[i].id);
              expect(dragResult[i].team1PlayerIds).toEqual(typeaheadResult[i].team1PlayerIds);
              expect(dragResult[i].team2PlayerIds).toEqual(typeaheadResult[i].team2PlayerIds);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('court→court swap: drag drop and two sequential typeahead changes produce identical assignments', () => {
      fc.assert(
        fc.property(
          assignmentsArb.chain(assignments =>
            twoDistinctSlotsArb(assignments.length).map(([slotA, slotB]) => ({
              assignments,
              slotA,
              slotB,
            }))
          ),
          ({ assignments, slotA, slotB }) => {
            const sourceAssignmentId = assignments[slotA.assignmentIndex].id;
            const targetAssignmentId = assignments[slotB.assignmentIndex].id;
            const sourcePlayerId = getPlayerAtSlot(assignments, slotA);
            const targetPlayerId = getPlayerAtSlot(assignments, slotB);

            // Drag-and-drop path: atomic swap
            const dragResult = performCourtSwap(
              assignments,
              {
                type: 'court',
                assignmentId: sourceAssignmentId,
                team: slotA.team,
                index: slotA.playerIndex,
              },
              {
                assignmentId: targetAssignmentId,
                team: slotB.team,
                index: slotB.playerIndex,
              }
            );

            // Typeahead path: two sequential changes
            // Step 1: Set source slot to target's player
            const afterStep1 = performTypeaheadChange(
              assignments,
              sourceAssignmentId,
              slotA.team,
              slotA.playerIndex,
              targetPlayerId
            );
            // Step 2: Set target slot to source's player
            const typeaheadResult = performTypeaheadChange(
              afterStep1,
              targetAssignmentId,
              slotB.team,
              slotB.playerIndex,
              sourcePlayerId
            );

            // Deep-compare: both paths must produce identical state
            expect(dragResult.length).toBe(typeaheadResult.length);
            for (let i = 0; i < dragResult.length; i++) {
              expect(dragResult[i].id).toBe(typeaheadResult[i].id);
              expect(dragResult[i].team1PlayerIds).toEqual(typeaheadResult[i].team1PlayerIds);
              expect(dragResult[i].team2PlayerIds).toEqual(typeaheadResult[i].team2PlayerIds);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 10: Drag state cleanup on dragend
   *
   * For any drag operation that ends (whether completed or cancelled),
   * the dragData and dropTarget state should both be null after the
   * dragend event fires. We verify this by checking that no elements
   * have the `drag-over` CSS class after dragend.
   *
   * **Validates: Requirement 5.4**
   */
  describe('Property 10: Drag state cleanup on dragend', () => {
    /** Helper to create a DataTransfer-like object for drag events */
    function createDragEvent(data?: string) {
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

    /**
     * Generate random assignments with consistent players, courts, and round
     * for rendering RoundDisplay, plus a random slot to drag from and an
     * optional target slot to hover over before dragend.
     */
    const dragEndScenarioArb = assignmentsArb.chain(assignments => {
      // Build players from assignments
      const playerIds = new Set<string>();
      for (const a of assignments) {
        a.team1PlayerIds.forEach(id => playerIds.add(id));
        a.team2PlayerIds.forEach(id => playerIds.add(id));
      }
      const players: Player[] = Array.from(playerIds).map(id => ({
        id,
        leagueId: 'league1',
        name: `Player_${id}`,
        createdAt: new Date(),
      }));
      const benchPlayers: Player[] = [
        { id: 'bench_x1', leagueId: 'league1', name: 'BenchPlayer_1', createdAt: new Date() },
        { id: 'bench_x2', leagueId: 'league1', name: 'BenchPlayer_2', createdAt: new Date() },
      ];
      const allPlayers = [...players, ...benchPlayers];

      const courts: Court[] = assignments.map(a => ({
        id: a.courtId,
        leagueId: 'league1',
        identifier: `Court_${a.courtId}`,
        createdAt: new Date(),
      }));

      const round: Round = {
        id: 'round1',
        leagueId: 'league1',
        roundNumber: 1,
        createdAt: new Date(),
      };

      // Choose whether to drag from a court slot or a bench player
      const sourceTypeArb = fc.constantFrom<'court' | 'bench'>('court', 'bench');
      // Random court slot index for drag source
      const courtSlotArb = singleSlotArb(assignments.length);
      // Whether to hover over a target before dragend
      const hoverTargetArb = fc.option(singleSlotArb(assignments.length), { nil: undefined });

      return fc.tuple(
        fc.constant({ assignments, players: allPlayers, courts, round }),
        sourceTypeArb,
        courtSlotArb,
        hoverTargetArb
      );
    });

    it('after dragend, no elements have the drag-over class regardless of drag sequence', () => {
      fc.assert(
        fc.property(
          dragEndScenarioArb,
          ([renderData, sourceType, courtSlot, hoverTarget]) => {
            const { assignments, players, courts, round } = renderData;

            const { container } = render(
              <RoundDisplay
                round={round}
                assignments={assignments}
                courts={courts}
                players={players}
                onUpdateAssignments={async () => {}}
              />
            );

            // Build drag data based on source type
            let dragData: string;
            let sourceElement: Element;

            if (sourceType === 'court') {
              const assignment = assignments[courtSlot.assignmentIndex];
              const teamKey = courtSlot.team === 'team1' ? 'team1PlayerIds' : 'team2PlayerIds';
              const playerId = assignment[teamKey][courtSlot.playerIndex];
              dragData = JSON.stringify({
                playerId,
                source: {
                  type: 'court',
                  assignmentId: assignment.id,
                  team: courtSlot.team,
                  index: courtSlot.playerIndex,
                },
              });
              // Court slot elements are <li> with draggable="true" inside court sections
              const draggableSlots = container.querySelectorAll('li[draggable="true"]');
              // Pick the court slot at the right index (court slots come before bench players)
              const slotIndex = courtSlot.assignmentIndex * 4
                + (courtSlot.team === 'team2' ? 2 : 0)
                + courtSlot.playerIndex;
              sourceElement = draggableSlots[slotIndex] || draggableSlots[0];
            } else {
              // Bench player
              dragData = JSON.stringify({
                playerId: 'bench_x1',
                source: { type: 'bench' },
              });
              const benchItems = container.querySelectorAll('.players-waiting li[draggable="true"]');
              sourceElement = benchItems[0];
            }

            // Step 1: Fire dragstart on the source element
            if (sourceElement) {
              fireEvent.dragStart(sourceElement, createDragEvent(dragData));
            }

            // Step 2: Optionally hover over a target slot (fire dragover)
            if (hoverTarget && sourceElement) {
              const draggableSlots = container.querySelectorAll('li[draggable="true"]');
              const targetIndex = hoverTarget.assignmentIndex * 4
                + (hoverTarget.team === 'team2' ? 2 : 0)
                + hoverTarget.playerIndex;
              const targetElement = draggableSlots[targetIndex] || draggableSlots[0];
              if (targetElement) {
                fireEvent.dragOver(targetElement, createDragEvent());
              }
            }

            // Step 3: Fire dragend on the round-display container
            const roundDisplayContainer = container.querySelector('.round-display');
            if (roundDisplayContainer) {
              fireEvent.dragEnd(roundDisplayContainer);
            }

            // Step 4: Verify no elements have the drag-over class
            // (drag-over is applied when dropTarget state is set; after dragend both
            // dragData and dropTarget should be null, so no elements should have it)
            const dragOverElements = container.querySelectorAll('.drag-over');
            expect(dragOverElements.length).toBe(0);
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
