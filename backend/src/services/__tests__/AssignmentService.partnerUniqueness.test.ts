import { AssignmentService } from '../AssignmentService';
import { Assignment } from '../../models/Assignment';

describe('AssignmentService - Partner Uniqueness', () => {
  let service: AssignmentService;

  beforeEach(() => {
    service = new AssignmentService();
  });

  function makeAssignment(
    team1: string[],
    team2: string[],
    roundId = 'round-1',
    courtId = 'court-1'
  ): Assignment {
    return {
      id: `${roundId}-${courtId}`,
      roundId,
      courtId,
      team1PlayerIds: team1,
      team2PlayerIds: team2,
      createdAt: new Date(),
    };
  }

  describe('getPartnerKey', () => {
    it('should return the same key regardless of argument order', () => {
      expect(service.getPartnerKey('a', 'b')).toBe(service.getPartnerKey('b', 'a'));
    });

    it('should produce a canonical key with lexicographic ordering', () => {
      expect(service.getPartnerKey('z', 'a')).toBe('a_z');
      expect(service.getPartnerKey('a', 'z')).toBe('a_z');
    });

    it('should handle identical prefixes correctly', () => {
      expect(service.getPartnerKey('player-1', 'player-2')).toBe('player-1_player-2');
      expect(service.getPartnerKey('player-2', 'player-1')).toBe('player-1_player-2');
    });
  });

  describe('buildPartnershipHistory', () => {
    it('should return an empty map when input is undefined', () => {
      const result = service.buildPartnershipHistory(undefined);
      expect(result.size).toBe(0);
    });

    it('should return an empty map when input is an empty array', () => {
      const result = service.buildPartnershipHistory([]);
      expect(result.size).toBe(0);
    });

    it('should count pairs correctly for a single court assignment', () => {
      // Team1: [A, B], Team2: [C, D]
      // Within-team pairs: (A,B) and (C,D)
      const assignments = [makeAssignment(['A', 'B'], ['C', 'D'])];
      const history = service.buildPartnershipHistory(assignments);

      expect(history.get(service.getPartnerKey('A', 'B'))).toBe(1);
      expect(history.get(service.getPartnerKey('C', 'D'))).toBe(1);
      // Cross-team pairs should not be counted
      expect(history.has(service.getPartnerKey('A', 'C'))).toBe(false);
      expect(history.has(service.getPartnerKey('B', 'D'))).toBe(false);
      expect(history.size).toBe(2);
    });

    it('should accumulate counts across multiple rounds', () => {
      // Round 1: A+B vs C+D  → (A,B)=1, (C,D)=1
      // Round 2: A+B vs C+D  → (A,B)=2, (C,D)=2
      const assignments = [
        makeAssignment(['A', 'B'], ['C', 'D'], 'round-1'),
        makeAssignment(['A', 'B'], ['C', 'D'], 'round-2'),
      ];
      const history = service.buildPartnershipHistory(assignments);

      expect(history.get(service.getPartnerKey('A', 'B'))).toBe(2);
      expect(history.get(service.getPartnerKey('C', 'D'))).toBe(2);
      expect(history.size).toBe(2);
    });

    it('should track players on different teams across rounds independently', () => {
      // Round 1: A+B vs C+D  → (A,B)=1, (C,D)=1
      // Round 2: A+C vs B+D  → (A,C)=1, (B,D)=1
      const assignments = [
        makeAssignment(['A', 'B'], ['C', 'D'], 'round-1'),
        makeAssignment(['A', 'C'], ['B', 'D'], 'round-2'),
      ];
      const history = service.buildPartnershipHistory(assignments);

      expect(history.get(service.getPartnerKey('A', 'B'))).toBe(1);
      expect(history.get(service.getPartnerKey('C', 'D'))).toBe(1);
      expect(history.get(service.getPartnerKey('A', 'C'))).toBe(1);
      expect(history.get(service.getPartnerKey('B', 'D'))).toBe(1);
      // A-D and B-C were never teammates
      expect(history.has(service.getPartnerKey('A', 'D'))).toBe(false);
      expect(history.has(service.getPartnerKey('B', 'C'))).toBe(false);
      expect(history.size).toBe(4);
    });

    it('should handle teams larger than 2 by enumerating all C(n,2) pairs', () => {
      // Team of 3: [A, B, C] → pairs (A,B), (A,C), (B,C) = 3 pairs
      const assignments = [makeAssignment(['A', 'B', 'C'], ['D'])];
      const history = service.buildPartnershipHistory(assignments);

      expect(history.get(service.getPartnerKey('A', 'B'))).toBe(1);
      expect(history.get(service.getPartnerKey('A', 'C'))).toBe(1);
      expect(history.get(service.getPartnerKey('B', 'C'))).toBe(1);
      expect(history.size).toBe(3); // D alone has no pairs
    });

    it('should only contain non-negative integer values', () => {
      const assignments = [
        makeAssignment(['A', 'B'], ['C', 'D'], 'round-1'),
        makeAssignment(['A', 'B'], ['C', 'D'], 'round-2'),
        makeAssignment(['A', 'C'], ['B', 'D'], 'round-3'),
      ];
      const history = service.buildPartnershipHistory(assignments);

      for (const count of history.values()) {
        expect(count).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(count)).toBe(true);
      }
    });
  });
});

describe('AssignmentService - scoreSplit and optimizeTeamSplit', () => {
  let service: AssignmentService;

  beforeEach(() => {
    service = new AssignmentService();
  });

  function makePlayer(id: string): { id: string; leagueId: string; name: string; createdAt: Date } {
    return { id, leagueId: 'league-1', name: `Player ${id}`, createdAt: new Date() };
  }

  describe('scoreSplit', () => {
    it('should return 0 when partnership history is empty', () => {
      const history = new Map<string, number>();
      expect(service.scoreSplit(['A', 'B'], ['C', 'D'], history)).toBe(0);
    });

    it('should sum within-team pair counts from both teams', () => {
      const history = new Map<string, number>();
      history.set(service.getPartnerKey('A', 'B'), 2);
      history.set(service.getPartnerKey('C', 'D'), 3);
      // Score = 2 (A+B on team1) + 3 (C+D on team2) = 5
      expect(service.scoreSplit(['A', 'B'], ['C', 'D'], history)).toBe(5);
    });

    it('should default to 0 for pairs not in the map', () => {
      const history = new Map<string, number>();
      history.set(service.getPartnerKey('A', 'B'), 1);
      // C+D not in map → defaults to 0
      expect(service.scoreSplit(['A', 'B'], ['C', 'D'], history)).toBe(1);
    });

    it('should not count cross-team pairs', () => {
      const history = new Map<string, number>();
      history.set(service.getPartnerKey('A', 'C'), 5);
      history.set(service.getPartnerKey('B', 'D'), 5);
      // A and C are on different teams, B and D are on different teams
      expect(service.scoreSplit(['A', 'B'], ['C', 'D'], history)).toBe(0);
    });

    it('should only consider pairs where both players are in the provided team arrays', () => {
      const history = new Map<string, number>();
      history.set(service.getPartnerKey('A', 'X'), 10); // X not on any team
      history.set(service.getPartnerKey('A', 'B'), 1);
      expect(service.scoreSplit(['A', 'B'], ['C', 'D'], history)).toBe(1);
    });
  });

  describe('optimizeTeamSplit', () => {
    it('should return a valid 2v2 split when all pairs have zero history', () => {
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const history = new Map<string, number>();
      const [team1, team2] = service.optimizeTeamSplit(players, history);

      expect(team1).toHaveLength(2);
      expect(team2).toHaveLength(2);
      expect([...team1, ...team2].sort()).toEqual(['A', 'B', 'C', 'D']);
    });

    it('should choose the split with the lowest score when one is clearly better', () => {
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const history = new Map<string, number>();
      // Make A+B and C+D expensive (split 1 score = 10+10 = 20)
      history.set(service.getPartnerKey('A', 'B'), 10);
      history.set(service.getPartnerKey('C', 'D'), 10);
      // Make A+C and B+D expensive (split 2 score = 10+10 = 20)
      history.set(service.getPartnerKey('A', 'C'), 10);
      history.set(service.getPartnerKey('B', 'D'), 10);
      // Split 3: {A,D} vs {B,C} → score = 0+0 = 0 (clearly best)

      const [team1, team2] = service.optimizeTeamSplit(players, history);
      expect(team1.sort()).toEqual(['A', 'D']);
      expect(team2.sort()).toEqual(['B', 'C']);
    });

    it('should choose one of the tied splits (not the worse one)', () => {
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const history = new Map<string, number>();
      // Split 1: {A,B} vs {C,D} → score = 0+0 = 0 (tied best)
      // Split 2: {A,C} vs {B,D} → score = 0+0 = 0 (tied best)
      // Split 3: {A,D} vs {B,C} → score = 5 (worse)
      history.set(service.getPartnerKey('A', 'D'), 5);

      // Run multiple times to verify it never picks the worse split
      for (let i = 0; i < 20; i++) {
        const [team1, team2] = service.optimizeTeamSplit(players, history);
        const score = service.scoreSplit(team1, team2, history);
        expect(score).toBe(0);
      }
    });

    it('should return a valid split when all splits have equal score', () => {
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const history = new Map<string, number>();
      // Make every pair have the same count → all splits score equally
      history.set(service.getPartnerKey('A', 'B'), 1);
      history.set(service.getPartnerKey('A', 'C'), 1);
      history.set(service.getPartnerKey('A', 'D'), 1);
      history.set(service.getPartnerKey('B', 'C'), 1);
      history.set(service.getPartnerKey('B', 'D'), 1);
      history.set(service.getPartnerKey('C', 'D'), 1);

      const [team1, team2] = service.optimizeTeamSplit(players, history);
      expect(team1).toHaveLength(2);
      expect(team2).toHaveLength(2);
      expect([...team1, ...team2].sort()).toEqual(['A', 'B', 'C', 'D']);
    });

    it('should still return a valid split when all pairings are exhausted with high counts', () => {
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const history = new Map<string, number>();
      // All pairings used many times
      history.set(service.getPartnerKey('A', 'B'), 50);
      history.set(service.getPartnerKey('A', 'C'), 50);
      history.set(service.getPartnerKey('A', 'D'), 50);
      history.set(service.getPartnerKey('B', 'C'), 50);
      history.set(service.getPartnerKey('B', 'D'), 50);
      history.set(service.getPartnerKey('C', 'D'), 50);

      const [team1, team2] = service.optimizeTeamSplit(players, history);
      expect(team1).toHaveLength(2);
      expect(team2).toHaveLength(2);
      expect([...team1, ...team2].sort()).toEqual(['A', 'B', 'C', 'D']);
    });
  });
});

describe('AssignmentService - Partnership Optimization Integration', () => {
  let service: AssignmentService;
  const leagueId = 'league-1';

  beforeEach(() => {
    service = new AssignmentService();
    // Clear dataStore before each test
    const { dataStore } = require('../../data/DataStore');
    dataStore.clear();
  });

  function makePlayer(id: string): { id: string; leagueId: string; name: string; createdAt: Date } {
    return { id, leagueId, name: `Player ${id}`, createdAt: new Date() };
  }

  function makeCourt(id: string): { id: string; leagueId: string; identifier: string; createdAt: Date } {
    return { id, leagueId, identifier: `Court ${id}`, createdAt: new Date() };
  }

  function makeAssignment(
    team1: string[],
    team2: string[],
    roundId = 'round-1',
    courtId = 'court-1'
  ): Assignment {
    return {
      id: `${roundId}-${courtId}`,
      roundId,
      courtId,
      team1PlayerIds: team1,
      team2PlayerIds: team2,
      createdAt: new Date(),
    };
  }

  function getPartnerPairs(assignments: Assignment[]): Set<string> {
    const pairs = new Set<string>();
    for (const a of assignments) {
      for (let i = 0; i < a.team1PlayerIds.length; i++) {
        for (let j = i + 1; j < a.team1PlayerIds.length; j++) {
          pairs.add(service.getPartnerKey(a.team1PlayerIds[i], a.team1PlayerIds[j]));
        }
      }
      for (let i = 0; i < a.team2PlayerIds.length; i++) {
        for (let j = i + 1; j < a.team2PlayerIds.length; j++) {
          pairs.add(service.getPartnerKey(a.team2PlayerIds[i], a.team2PlayerIds[j]));
        }
      }
    }
    return pairs;
  }

  describe('two rounds with same 4 players - second round avoids first round pairings', () => {
    it('should produce different partner pairings in the second round', () => {
      const { dataStore } = require('../../data/DataStore');
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const courts = [makeCourt('c1')];
      courts.forEach(c => dataStore.createCourt(c));

      // Generate round 1 without history
      const round1 = service.generateAssignments(players, courts, 'round-1');

      const round1Pairs = getPartnerPairs(round1);

      // Run multiple trials to account for randomness
      let avoidedAtLeastOnce = false;
      for (let trial = 0; trial < 20; trial++) {
        dataStore.clear();
        courts.forEach(c => dataStore.createCourt(c));

        const round2 = service.generateAssignments(
          players, courts, `round-2-${trial}`, 4, round1, undefined, round1
        );
        const round2Pairs = getPartnerPairs(round2);

        // Check if round 2 avoided at least one of round 1's pairings
        let hasOverlap = true;
        for (const pair of round2Pairs) {
          if (!round1Pairs.has(pair)) {
            hasOverlap = false;
            break;
          }
        }
        if (!hasOverlap) {
          avoidedAtLeastOnce = true;
          break;
        }
      }

      expect(avoidedAtLeastOnce).toBe(true);
    });
  });

  describe('three rounds with same 4 players - third round picks least-repeated', () => {
    it('should pick the split with the fewest repeat partnerships in round 3', () => {
      const { dataStore } = require('../../data/DataStore');
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const courts = [makeCourt('c1')];

      // For 4 players there are only 3 possible 2v2 splits:
      // Split 1: {A,B} vs {C,D}
      // Split 2: {A,C} vs {B,D}
      // Split 3: {A,D} vs {B,C}
      // After 2 rounds using 2 different splits, the 3rd round should pick the unused one.

      const round1Assignments = [makeAssignment(['A', 'B'], ['C', 'D'], 'round-1', 'c1')];
      const round2Assignments = [makeAssignment(['A', 'C'], ['B', 'D'], 'round-2', 'c1')];
      const allPrevious = [...round1Assignments, ...round2Assignments];

      // The only split with score 0 is {A,D} vs {B,C}
      let pickedOptimal = false;
      for (let trial = 0; trial < 20; trial++) {
        dataStore.clear();
        courts.forEach(c => dataStore.createCourt(c));

        const round3 = service.generateAssignments(
          players, courts, `round-3-${trial}`, 4, round2Assignments, undefined, allPrevious
        );

        const round3Pairs = getPartnerPairs(round3);
        // The optimal split {A,D} vs {B,C} has pairs: A_D and B_C
        if (round3Pairs.has(service.getPartnerKey('A', 'D')) &&
            round3Pairs.has(service.getPartnerKey('B', 'C'))) {
          pickedOptimal = true;
          break;
        }
      }

      expect(pickedOptimal).toBe(true);
    });
  });

  describe('partnership optimization works alongside bye fairness', () => {
    it('should apply bye fairness sorting and partnership optimization together', () => {
      const { dataStore } = require('../../data/DataStore');
      // 5 players, 1 court → 4 play, 1 bye
      const players = [
        makePlayer('A'), makePlayer('B'), makePlayer('C'),
        makePlayer('D'), makePlayer('E'),
      ];
      const courts = [makeCourt('c1')];
      courts.forEach(c => dataStore.createCourt(c));

      // Bye count map: E has most byes → should be prioritized to play
      const byeCountMap = new Map<string, number>();
      byeCountMap.set('A', 0);
      byeCountMap.set('B', 0);
      byeCountMap.set('C', 0);
      byeCountMap.set('D', 0);
      byeCountMap.set('E', 2);

      // Previous assignments: A+B were partners
      const prevAssignments = [makeAssignment(['A', 'B'], ['C', 'D'], 'round-1', 'c1')];

      const assignments = service.generateAssignments(
        players, courts, 'round-2', 4, prevAssignments, byeCountMap, prevAssignments
      );

      expect(assignments).toHaveLength(1);
      const allAssigned = [
        ...assignments[0].team1PlayerIds,
        ...assignments[0].team2PlayerIds,
      ];
      expect(allAssigned).toHaveLength(4);

      // E should be playing (highest bye count = highest priority)
      expect(allAssigned).toContain('E');
    });
  });

  describe('backward compatibility - generateAssignments without allPreviousAssignments', () => {
    it('should work when allPreviousAssignments is not provided', () => {
      const { dataStore } = require('../../data/DataStore');
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const courts = [makeCourt('c1')];
      courts.forEach(c => dataStore.createCourt(c));

      const assignments = service.generateAssignments(players, courts, 'round-1');

      expect(assignments).toHaveLength(1);
      expect(assignments[0].team1PlayerIds).toHaveLength(2);
      expect(assignments[0].team2PlayerIds).toHaveLength(2);
      const allIds = [...assignments[0].team1PlayerIds, ...assignments[0].team2PlayerIds].sort();
      expect(allIds).toEqual(['A', 'B', 'C', 'D']);
    });

    it('should work when allPreviousAssignments is undefined', () => {
      const { dataStore } = require('../../data/DataStore');
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const courts = [makeCourt('c1')];
      courts.forEach(c => dataStore.createCourt(c));

      const assignments = service.generateAssignments(
        players, courts, 'round-1', 4, undefined, undefined, undefined
      );

      expect(assignments).toHaveLength(1);
      expect(assignments[0].team1PlayerIds).toHaveLength(2);
      expect(assignments[0].team2PlayerIds).toHaveLength(2);
    });

    it('should work when allPreviousAssignments is an empty array', () => {
      const { dataStore } = require('../../data/DataStore');
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const courts = [makeCourt('c1')];
      courts.forEach(c => dataStore.createCourt(c));

      const assignments = service.generateAssignments(
        players, courts, 'round-1', 4, undefined, undefined, []
      );

      expect(assignments).toHaveLength(1);
      expect(assignments[0].team1PlayerIds).toHaveLength(2);
      expect(assignments[0].team2PlayerIds).toHaveLength(2);
    });
  });

  describe('reassignPlayers is unaffected by partnership optimization', () => {
    it('should allow manual overrides without partnership optimization', () => {
      const { dataStore } = require('../../data/DataStore');
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      players.forEach(p => dataStore.createPlayer(p));
      const courts = [makeCourt('c1')];
      courts.forEach(c => dataStore.createCourt(c));

      // Generate initial assignments with partnership history
      const prevAssignments = [makeAssignment(['A', 'B'], ['C', 'D'], 'round-1', 'c1')];
      const assignments = service.generateAssignments(
        players, courts, 'round-2', 4, prevAssignments, undefined, prevAssignments
      );

      // Now manually reassign to the exact pairing the optimizer would avoid
      const manualAssignments = [{
        courtId: 'c1',
        team1PlayerIds: ['A', 'B'],
        team2PlayerIds: ['C', 'D'],
      }];

      const result = service.reassignPlayers('round-2', manualAssignments);

      expect(result).toHaveLength(1);
      expect(result[0].team1PlayerIds).toEqual(['A', 'B']);
      expect(result[0].team2PlayerIds).toEqual(['C', 'D']);
    });
  });

  describe('areTeamCompositionsIdentical check still works with partnership optimization', () => {
    it('should avoid producing identical team compositions to the previous round', () => {
      const { dataStore } = require('../../data/DataStore');
      const players = [
        makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D'),
        makePlayer('E'), makePlayer('F'), makePlayer('G'), makePlayer('H'),
      ];
      const courts = [makeCourt('c1'), makeCourt('c2')];
      courts.forEach(c => dataStore.createCourt(c));

      const round1 = service.generateAssignments(players, courts, 'round-1');

      // Run multiple trials to verify the duplicate check still works
      for (let trial = 0; trial < 10; trial++) {
        dataStore.clear();
        courts.forEach(c => dataStore.createCourt(c));

        const round2 = service.generateAssignments(
          players, courts, `round-2-${trial}`, 4, round1, undefined, round1
        );

        // Extract sorted team sets for comparison
        const r1Teams = round1.map(a => [
          [...a.team1PlayerIds].sort().join(','),
          [...a.team2PlayerIds].sort().join(','),
        ].sort().join('|')).sort();

        const r2Teams = round2.map(a => [
          [...a.team1PlayerIds].sort().join(','),
          [...a.team2PlayerIds].sort().join(','),
        ].sort().join('|')).sort();

        const identical = r1Teams.length === r2Teams.length &&
          r1Teams.every((t, i) => t === r2Teams[i]);

        // With 8 players and 2 courts, there are many possible compositions,
        // so the retry logic should find a different one
        expect(identical).toBe(false);
      }
    });
  });
});


describe('AssignmentService - Edge Cases and Deleted Player Handling', () => {
  let service: AssignmentService;
  const leagueId = 'league-1';

  beforeEach(() => {
    service = new AssignmentService();
    const { dataStore } = require('../../data/DataStore');
    dataStore.clear();
  });

  function makePlayer(id: string): { id: string; leagueId: string; name: string; createdAt: Date } {
    return { id, leagueId, name: `Player ${id}`, createdAt: new Date() };
  }

  function makeCourt(id: string): { id: string; leagueId: string; identifier: string; createdAt: Date } {
    return { id, leagueId, identifier: `Court ${id}`, createdAt: new Date() };
  }

  function makeAssignment(
    team1: string[],
    team2: string[],
    roundId = 'round-1',
    courtId = 'court-1'
  ): Assignment {
    return {
      id: `${roundId}-${courtId}`,
      roundId,
      courtId,
      team1PlayerIds: team1,
      team2PlayerIds: team2,
      createdAt: new Date(),
    };
  }

  describe('Edge Cases', () => {
    it('single court, 4 players, first round → random split (no history)', () => {
      const { dataStore } = require('../../data/DataStore');
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const courts = [makeCourt('c1')];
      courts.forEach(c => dataStore.createCourt(c));

      // No allPreviousAssignments → empty history → random split
      const assignments = service.generateAssignments(players, courts, 'round-1');

      expect(assignments).toHaveLength(1);
      expect(assignments[0].team1PlayerIds).toHaveLength(2);
      expect(assignments[0].team2PlayerIds).toHaveLength(2);
      const allIds = [...assignments[0].team1PlayerIds, ...assignments[0].team2PlayerIds].sort();
      expect(allIds).toEqual(['A', 'B', 'C', 'D']);
    });

    it('more players than court slots → bye players excluded from partnership scoring', () => {
      const { dataStore } = require('../../data/DataStore');
      // 6 players, 1 court (4 slots) → 2 players get bye
      const players = [
        makePlayer('A'), makePlayer('B'), makePlayer('C'),
        makePlayer('D'), makePlayer('E'), makePlayer('F'),
      ];
      const courts = [makeCourt('c1')];
      courts.forEach(c => dataStore.createCourt(c));

      // History: A+B were partners before
      const prevAssignments = [makeAssignment(['A', 'B'], ['C', 'D'], 'round-1', 'c1')];

      const assignments = service.generateAssignments(
        players, courts, 'round-2', 4, prevAssignments, undefined, prevAssignments
      );

      expect(assignments).toHaveLength(1);
      const assigned = [
        ...assignments[0].team1PlayerIds,
        ...assignments[0].team2PlayerIds,
      ];
      // Only 4 of 6 players should be assigned
      expect(assigned).toHaveLength(4);
      // All assigned players should come from the original 6
      for (const id of assigned) {
        expect(['A', 'B', 'C', 'D', 'E', 'F']).toContain(id);
      }
      // Bye players (the 2 not assigned) should not appear
      const byePlayers = ['A', 'B', 'C', 'D', 'E', 'F'].filter(id => !assigned.includes(id));
      expect(byePlayers).toHaveLength(2);
    });

    it('only 2 players (1v1 court) → no split optimization needed', () => {
      const { dataStore } = require('../../data/DataStore');
      const players = [makePlayer('A'), makePlayer('B')];
      const courts = [makeCourt('c1')];
      courts.forEach(c => dataStore.createCourt(c));

      // playersPerCourt=2 → optimization branch won't trigger (requires === 4)
      const prevAssignments = [makeAssignment(['A'], ['B'], 'round-1', 'c1')];

      const assignments = service.generateAssignments(
        players, courts, 'round-2', 2, prevAssignments, undefined, prevAssignments
      );

      expect(assignments).toHaveLength(1);
      expect(assignments[0].team1PlayerIds).toHaveLength(1);
      expect(assignments[0].team2PlayerIds).toHaveLength(1);
      const allIds = [...assignments[0].team1PlayerIds, ...assignments[0].team2PlayerIds].sort();
      expect(allIds).toEqual(['A', 'B']);
    });

    it('large number of rounds → algorithm still picks lowest-score split', () => {
      const { dataStore } = require('../../data/DataStore');
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const courts = [makeCourt('c1')];
      courts.forEach(c => dataStore.createCourt(c));

      // Build 20 rounds of history where A+B and C+D are always partners
      // This makes split {A,B} vs {C,D} very expensive (score=40)
      const allPrevious: Assignment[] = [];
      for (let r = 1; r <= 20; r++) {
        allPrevious.push(makeAssignment(['A', 'B'], ['C', 'D'], `round-${r}`, 'c1'));
      }

      // The optimizer should avoid {A,B} vs {C,D} since it has score 40
      // It should pick one of the other two splits with score 0
      let avoidedExpensiveSplit = false;
      for (let trial = 0; trial < 20; trial++) {
        dataStore.clear();
        courts.forEach(c => dataStore.createCourt(c));

        const assignments = service.generateAssignments(
          players, courts, `round-21-${trial}`, 4,
          [allPrevious[allPrevious.length - 1]], undefined, allPrevious
        );

        const t1 = [...assignments[0].team1PlayerIds].sort();
        const t2 = [...assignments[0].team2PlayerIds].sort();
        // Check it's NOT the expensive split {A,B} vs {C,D}
        const isExpensive =
          (t1.join(',') === 'A,B' && t2.join(',') === 'C,D') ||
          (t1.join(',') === 'C,D' && t2.join(',') === 'A,B');
        if (!isExpensive) {
          avoidedExpensiveSplit = true;
          break;
        }
      }

      expect(avoidedExpensiveSplit).toBe(true);
    });
  });

  describe('Deleted Player Handling', () => {
    it('deleted player historical partnerships preserved in map', () => {
      // Player X played in round 1 but is now "deleted" (not in current roster)
      const prevAssignments = [
        makeAssignment(['X', 'A'], ['B', 'C'], 'round-1', 'c1'),
      ];

      const history = service.buildPartnershipHistory(prevAssignments);

      // X's partnerships should still be in the map
      expect(history.get(service.getPartnerKey('X', 'A'))).toBe(1);
      // Other pairs should also be present
      expect(history.get(service.getPartnerKey('B', 'C'))).toBe(1);
      expect(history.size).toBe(2);
    });

    it('deleted player excluded from future court assignments', () => {
      const { dataStore } = require('../../data/DataStore');
      // Player X was in round 1 but is NOT in the current players array
      const currentPlayers = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const courts = [makeCourt('c1')];
      courts.forEach(c => dataStore.createCourt(c));

      // History includes deleted player X
      const prevAssignments = [
        makeAssignment(['X', 'A'], ['B', 'C'], 'round-1', 'c1'),
      ];

      const assignments = service.generateAssignments(
        currentPlayers, courts, 'round-2', 4, prevAssignments, undefined, prevAssignments
      );

      expect(assignments).toHaveLength(1);
      const allAssigned = [
        ...assignments[0].team1PlayerIds,
        ...assignments[0].team2PlayerIds,
      ];
      // X should NOT be in the assignments
      expect(allAssigned).not.toContain('X');
      // Only current roster players should be assigned
      expect(allAssigned.sort()).toEqual(['A', 'B', 'C', 'D']);
    });

    it('remaining players partnership scores unaffected by deletion', () => {
      // History: X+A were partners, B+C were partners
      // After X is deleted, scoring for current court [A,B,C,D] should
      // NOT include X's partnerships — only pairs where both are on the court
      const prevAssignments = [
        makeAssignment(['X', 'A'], ['B', 'C'], 'round-1', 'c1'),
      ];

      const history = service.buildPartnershipHistory(prevAssignments);

      // Score a split of current players only: {A,B} vs {C,D}
      // A+B: not in history → 0, C+D: not in history → 0
      const score1 = service.scoreSplit(['A', 'B'], ['C', 'D'], history);
      expect(score1).toBe(0);

      // Score another split: {A,C} vs {B,D}
      // A+C: not in history → 0, B+D: not in history → 0
      const score2 = service.scoreSplit(['A', 'C'], ['B', 'D'], history);
      expect(score2).toBe(0);

      // The X+A pair (count=1) exists in the map but doesn't affect scoring
      // because X is not in any of the team arrays being scored
      expect(history.has(service.getPartnerKey('X', 'A'))).toBe(true);
    });
  });
});
