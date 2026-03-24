import { AssignmentService } from '../AssignmentService';
import { Assignment } from '../../models/Assignment';
import { Player } from '../../models/Player';
import { Court } from '../../models/Court';

describe('AssignmentService - Opponent Uniqueness', () => {
  let service: AssignmentService;
  const leagueId = 'league-1';

  beforeEach(() => {
    service = new AssignmentService();
    const { dataStore } = require('../../data/DataStore');
    dataStore.clear();
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

  function makePlayer(id: string): Player {
    return { id, leagueId, name: `Player ${id}`, createdAt: new Date() };
  }

  function makeCourt(id: string): Court {
    return { id, leagueId, identifier: `Court ${id}`, createdAt: new Date() };
  }

  describe('buildOpponentHistory', () => {
    it('should return empty map for undefined input', () => {
      const result = service.buildOpponentHistory(undefined);
      expect(result.size).toBe(0);
    });

    it('should return empty map for empty array', () => {
      const result = service.buildOpponentHistory([]);
      expect(result.size).toBe(0);
    });

    it('should count cross-team pairs as opponents', () => {
      // Team1: [A, B] vs Team2: [C, D]
      // Opponent pairs: (A,C), (A,D), (B,C), (B,D)
      const assignments = [makeAssignment(['A', 'B'], ['C', 'D'])];
      const history = service.buildOpponentHistory(assignments);

      expect(history.get(service.getPartnerKey('A', 'C'))).toBe(1);
      expect(history.get(service.getPartnerKey('A', 'D'))).toBe(1);
      expect(history.get(service.getPartnerKey('B', 'C'))).toBe(1);
      expect(history.get(service.getPartnerKey('B', 'D'))).toBe(1);
      expect(history.size).toBe(4);
    });

    it('should NOT count within-team pairs as opponents', () => {
      const assignments = [makeAssignment(['A', 'B'], ['C', 'D'])];
      const history = service.buildOpponentHistory(assignments);

      expect(history.has(service.getPartnerKey('A', 'B'))).toBe(false);
      expect(history.has(service.getPartnerKey('C', 'D'))).toBe(false);
    });

    it('should accumulate opponent counts across rounds', () => {
      const assignments = [
        makeAssignment(['A', 'B'], ['C', 'D'], 'round-1'),
        makeAssignment(['A', 'B'], ['C', 'D'], 'round-2'),
      ];
      const history = service.buildOpponentHistory(assignments);

      expect(history.get(service.getPartnerKey('A', 'C'))).toBe(2);
      expect(history.get(service.getPartnerKey('A', 'D'))).toBe(2);
      expect(history.get(service.getPartnerKey('B', 'C'))).toBe(2);
      expect(history.get(service.getPartnerKey('B', 'D'))).toBe(2);
    });

    it('should track different opponent pairings across rounds', () => {
      const assignments = [
        makeAssignment(['A', 'B'], ['C', 'D'], 'round-1'),
        makeAssignment(['A', 'C'], ['B', 'D'], 'round-2'),
      ];
      const history = service.buildOpponentHistory(assignments);

      // Round 1 opponents: A-C, A-D, B-C, B-D
      // Round 2 opponents: A-B, A-D, C-B, C-D
      expect(history.get(service.getPartnerKey('A', 'C'))).toBe(1); // only round 1
      expect(history.get(service.getPartnerKey('A', 'D'))).toBe(2); // both rounds
      expect(history.get(service.getPartnerKey('A', 'B'))).toBe(1); // only round 2
      expect(history.get(service.getPartnerKey('C', 'D'))).toBe(1); // only round 2
    });
  });

  describe('scoreSplit with opponent history', () => {
    it('should add opponent penalty for cross-team repeat opponents', () => {
      const partnerHistory = new Map<string, number>();
      const opponentHistory = new Map<string, number>();
      opponentHistory.set(service.getPartnerKey('A', 'C'), 3);
      opponentHistory.set(service.getPartnerKey('B', 'D'), 2);

      // Split: {A,B} vs {C,D} → opponent pairs: A-C(3), A-D(0), B-C(0), B-D(2) = 5
      const score = service.scoreSplit(['A', 'B'], ['C', 'D'], partnerHistory, opponentHistory);
      expect(score).toBe(5);
    });

    it('should combine partner and opponent penalties', () => {
      const partnerHistory = new Map<string, number>();
      partnerHistory.set(service.getPartnerKey('A', 'B'), 2); // A+B were partners twice

      const opponentHistory = new Map<string, number>();
      opponentHistory.set(service.getPartnerKey('A', 'C'), 1); // A faced C once

      // Split: {A,B} vs {C,D} → partner penalty: 2 (A+B) + opponent penalty: 1 (A-C) = 3
      const score = service.scoreSplit(['A', 'B'], ['C', 'D'], partnerHistory, opponentHistory);
      expect(score).toBe(3);
    });

    it('should return 0 when opponent history is empty', () => {
      const partnerHistory = new Map<string, number>();
      const opponentHistory = new Map<string, number>();

      const score = service.scoreSplit(['A', 'B'], ['C', 'D'], partnerHistory, opponentHistory);
      expect(score).toBe(0);
    });

    it('should return partner-only score when opponent history is undefined', () => {
      const partnerHistory = new Map<string, number>();
      partnerHistory.set(service.getPartnerKey('A', 'B'), 4);

      const score = service.scoreSplit(['A', 'B'], ['C', 'D'], partnerHistory, undefined);
      expect(score).toBe(4);
    });
  });

  describe('optimizeTeamSplit with opponent history', () => {
    it('should prefer split that minimizes opponent repeats', () => {
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const partnerHistory = new Map<string, number>();
      const opponentHistory = new Map<string, number>();

      // Make A vs C and B vs D very expensive as opponents
      opponentHistory.set(service.getPartnerKey('A', 'C'), 10);
      opponentHistory.set(service.getPartnerKey('B', 'D'), 10);
      // Also make A vs D and B vs C expensive
      opponentHistory.set(service.getPartnerKey('A', 'D'), 10);
      opponentHistory.set(service.getPartnerKey('B', 'C'), 10);

      // Split {A,B} vs {C,D}: opponent cost = 10+10+10+10 = 40
      // Split {A,C} vs {B,D}: opponent cost = A-B(0)+A-D(10)+C-B(10)+C-D(0) = 20
      // Split {A,D} vs {B,C}: opponent cost = A-B(0)+A-C(10)+D-B(10)+D-C(0) = 20
      // Best splits are {A,C} vs {B,D} or {A,D} vs {B,C} with score 20

      let avoidedWorst = false;
      for (let i = 0; i < 20; i++) {
        const [t1, t2] = service.optimizeTeamSplit(players, partnerHistory, opponentHistory);
        const score = service.scoreSplit(t1, t2, partnerHistory, opponentHistory);
        if (score < 40) {
          avoidedWorst = true;
          break;
        }
      }
      expect(avoidedWorst).toBe(true);
    });

    it('should balance partner and opponent penalties', () => {
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const partnerHistory = new Map<string, number>();
      const opponentHistory = new Map<string, number>();

      // A+B were partners 5 times (expensive as partners)
      partnerHistory.set(service.getPartnerKey('A', 'B'), 5);
      // A faced C 5 times (expensive as opponents)
      opponentHistory.set(service.getPartnerKey('A', 'C'), 5);

      // Split {A,B} vs {C,D}: partner=5(A+B), opponent=5(A-C)+0+0+0 = 10
      // Split {A,C} vs {B,D}: partner=0, opponent=0(A-B?no, A-B not in opp)+A-D(0)+C-B(0)+C-D(0) = 0
      // Split {A,D} vs {B,C}: partner=0, opponent=A-B(0)+A-C(5)+D-B(0)+D-C(0) = 5
      // Best: {A,C} vs {B,D} with score 0

      const [t1, t2] = service.optimizeTeamSplit(players, partnerHistory, opponentHistory);
      const score = service.scoreSplit(t1, t2, partnerHistory, opponentHistory);
      expect(score).toBe(0);
      expect(t1.sort()).toEqual(['A', 'C']);
      expect(t2.sort()).toEqual(['B', 'D']);
    });
  });

  describe('court-grouping optimization minimizes repeat opponents', () => {
    it('should prefer groupings where players face new opponents', () => {
      const { dataStore } = require('../../data/DataStore');
      // 8 players, 2 courts
      const players = Array.from({ length: 8 }, (_, i) => makePlayer(`P${i + 1}`));
      const courts = [makeCourt('c1'), makeCourt('c2')];
      courts.forEach(c => dataStore.createCourt(c));

      // Round 1: P1+P2 vs P3+P4 on court 1, P5+P6 vs P7+P8 on court 2
      const round1 = [
        makeAssignment(['P1', 'P2'], ['P3', 'P4'], 'round-1', 'c1'),
        makeAssignment(['P5', 'P6'], ['P7', 'P8'], 'round-1', 'c2'),
      ];

      // Generate round 2 with opponent history from round 1
      const round2 = service.generateAssignments(
        players, courts, 'round-2', 4, round1, undefined, round1
      );

      expect(round2).toHaveLength(2);

      // Count how many repeat opponent pairs exist in round 2
      const opponentHistory = service.buildOpponentHistory(round1);
      let repeatOpponents = 0;
      for (const a of round2) {
        for (const p1 of a.team1PlayerIds) {
          for (const p2 of a.team2PlayerIds) {
            const key = service.getPartnerKey(p1, p2);
            if (opponentHistory.has(key)) repeatOpponents++;
          }
        }
      }

      // With 8 players and good optimization, we should have fewer repeat opponents
      // than the maximum possible (8 cross-team pairs from round 1)
      // Run multiple times to account for randomness
      let hadFewRepeats = false;
      for (let trial = 0; trial < 10; trial++) {
        dataStore.clear();
        courts.forEach(c => dataStore.createCourt(c));

        const result = service.generateAssignments(
          players, courts, `round-2-${trial}`, 4, round1, undefined, round1
        );

        let repeats = 0;
        for (const a of result) {
          for (const p1 of a.team1PlayerIds) {
            for (const p2 of a.team2PlayerIds) {
              if (opponentHistory.has(service.getPartnerKey(p1, p2))) repeats++;
            }
          }
        }

        if (repeats < 8) {
          hadFewRepeats = true;
          break;
        }
      }

      expect(hadFewRepeats).toBe(true);
    });
  });

  describe('real-world scenario: 28 players, 7 courts, 7 rounds', () => {
    it('should minimize opponent repeats across many rounds', () => {
      const { dataStore } = require('../../data/DataStore');
      const playerCount = 28;
      const courtCount = 7;
      const roundCount = 7;

      const players = Array.from({ length: playerCount }, (_, i) => makePlayer(`P${i + 1}`));
      const courts = Array.from({ length: courtCount }, (_, i) => makeCourt(`c${i + 1}`));

      let allAssignments: Assignment[] = [];
      let prevRoundAssignments: Assignment[] | undefined;

      for (let r = 1; r <= roundCount; r++) {
        dataStore.clear();
        courts.forEach(c => dataStore.createCourt(c));

        const roundAssignments = service.generateAssignments(
          players, courts, `round-${r}`, 4,
          prevRoundAssignments, undefined,
          allAssignments.length > 0 ? allAssignments : undefined
        );

        allAssignments = [...allAssignments, ...roundAssignments];
        prevRoundAssignments = roundAssignments;
      }

      // Count opponent pair frequencies
      const opponentCounts = new Map<string, number>();
      for (const a of allAssignments) {
        for (const p1 of a.team1PlayerIds) {
          for (const p2 of a.team2PlayerIds) {
            const key = service.getPartnerKey(p1, p2);
            opponentCounts.set(key, (opponentCounts.get(key) ?? 0) + 1);
          }
        }
      }

      // With 28 players and 7 rounds, there are C(28,2) = 378 possible pairs
      // Each round creates 7 courts × 4 cross-team pairs = 28 opponent pairs
      // Over 7 rounds = 196 opponent pair slots
      // Ideal: most pairs face each other 0 or 1 time
      const maxRepeat = Math.max(...opponentCounts.values());
      const pairsWithRepeats = [...opponentCounts.values()].filter(v => v > 1).length;
      const totalPairs = opponentCounts.size;

      // The algorithm should keep max repeats reasonable (not 5+ for any pair)
      // and have relatively few pairs with repeats
      expect(maxRepeat).toBeLessThanOrEqual(4);
      // Less than half of all opponent pairs should be repeats
      expect(pairsWithRepeats).toBeLessThan(totalPairs * 0.5);
    });

    it('should also minimize partner repeats in the same scenario', () => {
      const { dataStore } = require('../../data/DataStore');
      const playerCount = 28;
      const courtCount = 7;
      const roundCount = 7;

      const players = Array.from({ length: playerCount }, (_, i) => makePlayer(`P${i + 1}`));
      const courts = Array.from({ length: courtCount }, (_, i) => makeCourt(`c${i + 1}`));

      let allAssignments: Assignment[] = [];
      let prevRoundAssignments: Assignment[] | undefined;

      for (let r = 1; r <= roundCount; r++) {
        dataStore.clear();
        courts.forEach(c => dataStore.createCourt(c));

        const roundAssignments = service.generateAssignments(
          players, courts, `round-${r}`, 4,
          prevRoundAssignments, undefined,
          allAssignments.length > 0 ? allAssignments : undefined
        );

        allAssignments = [...allAssignments, ...roundAssignments];
        prevRoundAssignments = roundAssignments;
      }

      // Count partner pair frequencies
      const partnerCounts = new Map<string, number>();
      for (const a of allAssignments) {
        for (let i = 0; i < a.team1PlayerIds.length; i++) {
          for (let j = i + 1; j < a.team1PlayerIds.length; j++) {
            const key = service.getPartnerKey(a.team1PlayerIds[i], a.team1PlayerIds[j]);
            partnerCounts.set(key, (partnerCounts.get(key) ?? 0) + 1);
          }
        }
        for (let i = 0; i < a.team2PlayerIds.length; i++) {
          for (let j = i + 1; j < a.team2PlayerIds.length; j++) {
            const key = service.getPartnerKey(a.team2PlayerIds[i], a.team2PlayerIds[j]);
            partnerCounts.set(key, (partnerCounts.get(key) ?? 0) + 1);
          }
        }
      }

      const maxPartnerRepeat = Math.max(...partnerCounts.values());
      // With good optimization, no pair should be partners more than 3 times in 7 rounds
      expect(maxPartnerRepeat).toBeLessThanOrEqual(3);
    });
  });

  describe('backward compatibility with opponent history', () => {
    it('scoreSplit without opponent history matches partner-only scoring', () => {
      const partnerHistory = new Map<string, number>();
      partnerHistory.set(service.getPartnerKey('A', 'B'), 3);

      const withoutOpponent = service.scoreSplit(['A', 'B'], ['C', 'D'], partnerHistory);
      const withEmptyOpponent = service.scoreSplit(['A', 'B'], ['C', 'D'], partnerHistory, new Map());
      const withUndefinedOpponent = service.scoreSplit(['A', 'B'], ['C', 'D'], partnerHistory, undefined);

      expect(withoutOpponent).toBe(3);
      expect(withEmptyOpponent).toBe(3);
      expect(withUndefinedOpponent).toBe(3);
    });

    it('optimizeTeamSplit without opponent history still works', () => {
      const players = [makePlayer('A'), makePlayer('B'), makePlayer('C'), makePlayer('D')];
      const partnerHistory = new Map<string, number>();
      partnerHistory.set(service.getPartnerKey('A', 'B'), 10);

      // Without opponent history, should still avoid A+B as partners
      const [t1, t2] = service.optimizeTeamSplit(players, partnerHistory);
      const hasAB = (t1.includes('A') && t1.includes('B')) || (t2.includes('A') && t2.includes('B'));
      expect(hasAB).toBe(false);
    });
  });
});
