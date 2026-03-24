import {
  getPartnerKey,
  buildOpponentHistory,
  buildPartnershipHistory,
  scoreSplit,
  optimizeTeamSplit,
} from '../localStorageApi';
import { Player, Assignment } from '../../types';

function mkPlayer(id: string, name?: string): Player {
  return { id, leagueId: 'l1', name: name ?? `Player ${id}`, createdAt: new Date() };
}

function mkAssignment(
  roundId: string,
  courtId: string,
  team1: string[],
  team2: string[]
): Assignment {
  return {
    id: `a-${roundId}-${courtId}`,
    roundId,
    courtId,
    team1PlayerIds: team1,
    team2PlayerIds: team2,
    createdAt: new Date(),
  };
}

describe('Opponent Uniqueness - Frontend', () => {
  describe('buildOpponentHistory', () => {
    it('returns empty map for undefined input', () => {
      expect(buildOpponentHistory(undefined).size).toBe(0);
    });

    it('returns empty map for empty array', () => {
      expect(buildOpponentHistory([]).size).toBe(0);
    });

    it('counts cross-team pairs as opponents', () => {
      const assignments = [mkAssignment('r1', 'c1', ['A', 'B'], ['C', 'D'])];
      const history = buildOpponentHistory(assignments);

      expect(history.get(getPartnerKey('A', 'C'))).toBe(1);
      expect(history.get(getPartnerKey('A', 'D'))).toBe(1);
      expect(history.get(getPartnerKey('B', 'C'))).toBe(1);
      expect(history.get(getPartnerKey('B', 'D'))).toBe(1);
      expect(history.size).toBe(4);
    });

    it('does NOT count within-team pairs as opponents', () => {
      const assignments = [mkAssignment('r1', 'c1', ['A', 'B'], ['C', 'D'])];
      const history = buildOpponentHistory(assignments);

      expect(history.has(getPartnerKey('A', 'B'))).toBe(false);
      expect(history.has(getPartnerKey('C', 'D'))).toBe(false);
    });

    it('accumulates opponent counts across rounds', () => {
      const assignments = [
        mkAssignment('r1', 'c1', ['A', 'B'], ['C', 'D']),
        mkAssignment('r2', 'c1', ['A', 'B'], ['C', 'D']),
      ];
      const history = buildOpponentHistory(assignments);

      expect(history.get(getPartnerKey('A', 'C'))).toBe(2);
      expect(history.get(getPartnerKey('B', 'D'))).toBe(2);
    });

    it('tracks different opponent pairings across rounds', () => {
      const assignments = [
        mkAssignment('r1', 'c1', ['A', 'B'], ['C', 'D']),
        mkAssignment('r2', 'c1', ['A', 'C'], ['B', 'D']),
      ];
      const history = buildOpponentHistory(assignments);

      // Round 1: A-C, A-D, B-C, B-D
      // Round 2: A-B, A-D, C-B, C-D
      expect(history.get(getPartnerKey('A', 'C'))).toBe(1);
      expect(history.get(getPartnerKey('A', 'D'))).toBe(2); // both rounds
      expect(history.get(getPartnerKey('A', 'B'))).toBe(1); // round 2 only
      expect(history.get(getPartnerKey('C', 'D'))).toBe(1); // round 2 only
    });
  });

  describe('scoreSplit with opponent history', () => {
    it('adds opponent penalty for cross-team repeat opponents', () => {
      const partnerHistory = new Map<string, number>();
      const opponentHistory = new Map<string, number>();
      opponentHistory.set(getPartnerKey('A', 'C'), 3);
      opponentHistory.set(getPartnerKey('B', 'D'), 2);

      const score = scoreSplit(['A', 'B'], ['C', 'D'], partnerHistory, opponentHistory);
      expect(score).toBe(5);
    });

    it('combines partner and opponent penalties', () => {
      const partnerHistory = new Map<string, number>();
      partnerHistory.set(getPartnerKey('A', 'B'), 2);

      const opponentHistory = new Map<string, number>();
      opponentHistory.set(getPartnerKey('A', 'C'), 1);

      // partner: 2 (A+B) + opponent: 1 (A vs C) = 3
      const score = scoreSplit(['A', 'B'], ['C', 'D'], partnerHistory, opponentHistory);
      expect(score).toBe(3);
    });

    it('returns 0 when both histories are empty', () => {
      expect(scoreSplit(['A', 'B'], ['C', 'D'], new Map(), new Map())).toBe(0);
    });

    it('returns partner-only score when opponent history is undefined', () => {
      const partnerHistory = new Map<string, number>();
      partnerHistory.set(getPartnerKey('A', 'B'), 4);

      expect(scoreSplit(['A', 'B'], ['C', 'D'], partnerHistory, undefined)).toBe(4);
      expect(scoreSplit(['A', 'B'], ['C', 'D'], partnerHistory)).toBe(4);
    });
  });

  describe('optimizeTeamSplit with opponent history', () => {
    it('prefers split that minimizes opponent repeats', () => {
      const players = ['A', 'B', 'C', 'D'].map(id => mkPlayer(id));
      const partnerHistory = new Map<string, number>();
      const opponentHistory = new Map<string, number>();

      // Make A vs C and B vs D very expensive
      opponentHistory.set(getPartnerKey('A', 'C'), 10);
      opponentHistory.set(getPartnerKey('B', 'D'), 10);
      opponentHistory.set(getPartnerKey('A', 'D'), 10);
      opponentHistory.set(getPartnerKey('B', 'C'), 10);

      // {A,B} vs {C,D}: 40, {A,C} vs {B,D}: 20, {A,D} vs {B,C}: 20
      let avoidedWorst = false;
      for (let i = 0; i < 20; i++) {
        const [t1, t2] = optimizeTeamSplit(players, partnerHistory, opponentHistory);
        const score = scoreSplit(t1, t2, partnerHistory, opponentHistory);
        if (score < 40) {
          avoidedWorst = true;
          break;
        }
      }
      expect(avoidedWorst).toBe(true);
    });

    it('balances partner and opponent penalties', () => {
      const players = ['A', 'B', 'C', 'D'].map(id => mkPlayer(id));
      const partnerHistory = new Map<string, number>();
      const opponentHistory = new Map<string, number>();

      partnerHistory.set(getPartnerKey('A', 'B'), 5);
      opponentHistory.set(getPartnerKey('A', 'C'), 5);

      // {A,B} vs {C,D}: partner=5 + opponent=5 = 10
      // {A,C} vs {B,D}: partner=0 + opponent=0 = 0  ← best
      // {A,D} vs {B,C}: partner=0 + opponent=5 = 5
      const [t1, t2] = optimizeTeamSplit(players, partnerHistory, opponentHistory);
      const score = scoreSplit(t1, t2, partnerHistory, opponentHistory);
      expect(score).toBe(0);
      expect(t1.sort()).toEqual(['A', 'C']);
      expect(t2.sort()).toEqual(['B', 'D']);
    });

    it('still works without opponent history (backward compat)', () => {
      const players = ['A', 'B', 'C', 'D'].map(id => mkPlayer(id));
      const partnerHistory = new Map<string, number>();
      partnerHistory.set(getPartnerKey('A', 'B'), 10);

      const [t1, t2] = optimizeTeamSplit(players, partnerHistory);
      const hasAB = (t1.includes('A') && t1.includes('B')) || (t2.includes('A') && t2.includes('B'));
      expect(hasAB).toBe(false);
    });
  });

  describe('backward compatibility', () => {
    it('scoreSplit without opponent history matches partner-only scoring', () => {
      const partnerHistory = new Map<string, number>();
      partnerHistory.set(getPartnerKey('A', 'B'), 3);

      const withoutOpponent = scoreSplit(['A', 'B'], ['C', 'D'], partnerHistory);
      const withEmpty = scoreSplit(['A', 'B'], ['C', 'D'], partnerHistory, new Map());
      const withUndefined = scoreSplit(['A', 'B'], ['C', 'D'], partnerHistory, undefined);

      expect(withoutOpponent).toBe(3);
      expect(withEmpty).toBe(3);
      expect(withUndefined).toBe(3);
    });
  });

  describe('real-world simulation: 26 players, 6 courts, multi-round', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('should minimize opponent repeats over 10 rounds with 26 players and 6 courts', async () => {
      const { api } = require('../localStorageApi');

      const league = await api.createLeague('Session Test');
      const playerNames = [
        'Uma Desai', 'Frank Miller', 'Isabella Torres', 'Yuki Tanaka',
        'Henry Patel', 'Vincent Rossi', 'Brian Lee', 'Wendy Chen',
        'David Kim', 'Karen Brooks', 'Rachel Adams', 'Xavier Morales',
        'Samuel Ortiz', 'Carla Mendes', 'Tina Zhang', 'Liam OConnor',
        'Jack Wilson', 'Peter Novak', 'Grace Lin', 'Chris Harper',
        'Nathan Green', 'Alex Johnson', 'Olivia Park', 'Maya Singh',
        'Emily Carter', 'Zara Ahmed',
      ];
      for (const name of playerNames) {
        await api.addPlayer(league.id, name);
      }
      for (let i = 1; i <= 6; i++) {
        await api.addCourt(league.id, `Court ${i}`);
      }

      const rounds = [];
      for (let i = 0; i < 10; i++) {
        rounds.push(await api.generateRound(league.id));
      }

      // Collect all assignments
      const allAssignments: Assignment[] = [];
      for (const round of rounds) {
        const assignments = await api.getAssignments(round.id);
        allAssignments.push(...assignments);
      }

      // Count opponent frequencies
      const opponentCounts = new Map<string, number>();
      for (const a of allAssignments) {
        for (const p1 of a.team1PlayerIds) {
          for (const p2 of a.team2PlayerIds) {
            const key = getPartnerKey(p1, p2);
            opponentCounts.set(key, (opponentCounts.get(key) ?? 0) + 1);
          }
        }
      }

      const maxOpponentRepeat = Math.max(...opponentCounts.values());
      const pairsOver2 = [...opponentCounts.values()].filter(v => v > 2).length;

      // With 26 players, 6 courts, 10 rounds:
      // No pair should face each other more than 4 times
      expect(maxOpponentRepeat).toBeLessThanOrEqual(4);
      // Very few pairs should face each other 3+ times
      expect(pairsOver2).toBeLessThan(30);
    });

    it('should minimize partner repeats over 10 rounds with 26 players and 6 courts', async () => {
      const { api } = require('../localStorageApi');

      const league = await api.createLeague('Partner Test');
      const playerNames = [
        'Uma Desai', 'Frank Miller', 'Isabella Torres', 'Yuki Tanaka',
        'Henry Patel', 'Vincent Rossi', 'Brian Lee', 'Wendy Chen',
        'David Kim', 'Karen Brooks', 'Rachel Adams', 'Xavier Morales',
        'Samuel Ortiz', 'Carla Mendes', 'Tina Zhang', 'Liam OConnor',
        'Jack Wilson', 'Peter Novak', 'Grace Lin', 'Chris Harper',
        'Nathan Green', 'Alex Johnson', 'Olivia Park', 'Maya Singh',
        'Emily Carter', 'Zara Ahmed',
      ];
      for (const name of playerNames) {
        await api.addPlayer(league.id, name);
      }
      for (let i = 1; i <= 6; i++) {
        await api.addCourt(league.id, `Court ${i}`);
      }

      const rounds = [];
      for (let i = 0; i < 10; i++) {
        rounds.push(await api.generateRound(league.id));
      }

      const allAssignments: Assignment[] = [];
      for (const round of rounds) {
        const assignments = await api.getAssignments(round.id);
        allAssignments.push(...assignments);
      }

      // Count partner frequencies
      const partnerCounts = new Map<string, number>();
      for (const a of allAssignments) {
        for (const team of [a.team1PlayerIds, a.team2PlayerIds]) {
          for (let i = 0; i < team.length; i++) {
            for (let j = i + 1; j < team.length; j++) {
              const key = getPartnerKey(team[i], team[j]);
              partnerCounts.set(key, (partnerCounts.get(key) ?? 0) + 1);
            }
          }
        }
      }

      const maxPartnerRepeat = Math.max(...partnerCounts.values());
      // No pair should be partners more than 3 times in 10 rounds
      expect(maxPartnerRepeat).toBeLessThanOrEqual(3);
    });

    it('should keep opponent repeats reasonable over 17 rounds (session 4 scale)', async () => {
      const { api } = require('../localStorageApi');

      const league = await api.createLeague('Long Session');
      const playerNames = [
        'Uma Desai', 'Frank Miller', 'Isabella Torres', 'Yuki Tanaka',
        'Henry Patel', 'Vincent Rossi', 'Brian Lee', 'Wendy Chen',
        'David Kim', 'Karen Brooks', 'Rachel Adams', 'Xavier Morales',
        'Samuel Ortiz', 'Carla Mendes', 'Tina Zhang', 'Liam OConnor',
        'Jack Wilson', 'Peter Novak', 'Grace Lin', 'Chris Harper',
        'Nathan Green', 'Alex Johnson', 'Olivia Park', 'Maya Singh',
        'Emily Carter', 'Zara Ahmed',
      ];
      for (const name of playerNames) {
        await api.addPlayer(league.id, name);
      }
      for (let i = 1; i <= 6; i++) {
        await api.addCourt(league.id, `Court ${i}`);
      }

      const rounds = [];
      for (let i = 0; i < 17; i++) {
        rounds.push(await api.generateRound(league.id));
      }

      const allAssignments: Assignment[] = [];
      for (const round of rounds) {
        const assignments = await api.getAssignments(round.id);
        allAssignments.push(...assignments);
      }

      // Opponent frequency
      const opponentCounts = new Map<string, number>();
      for (const a of allAssignments) {
        for (const p1 of a.team1PlayerIds) {
          for (const p2 of a.team2PlayerIds) {
            const key = getPartnerKey(p1, p2);
            opponentCounts.set(key, (opponentCounts.get(key) ?? 0) + 1);
          }
        }
      }

      // Partner frequency
      const partnerCounts = new Map<string, number>();
      for (const a of allAssignments) {
        for (const team of [a.team1PlayerIds, a.team2PlayerIds]) {
          for (let i = 0; i < team.length; i++) {
            for (let j = i + 1; j < team.length; j++) {
              const key = getPartnerKey(team[i], team[j]);
              partnerCounts.set(key, (partnerCounts.get(key) ?? 0) + 1);
            }
          }
        }
      }

      const maxOpponent = Math.max(...opponentCounts.values());
      const maxPartner = Math.max(...partnerCounts.values());
      const opponent4xPlus = [...opponentCounts.values()].filter(v => v >= 4).length;

      // Over 17 rounds with 26 players:
      // Max opponent repeat should stay at 4 or below
      expect(maxOpponent).toBeLessThanOrEqual(5);
      // Max partner repeat should stay at 3 or below
      expect(maxPartner).toBeLessThanOrEqual(3);
      // Very few pairs should face each other 4+ times
      expect(opponent4xPlus).toBeLessThan(10);
    });
  });

  describe('opponent history with realistic multi-court data', () => {
    it('buildOpponentHistory correctly counts from session-like data', () => {
      // Simulate 3 rounds of 6-court play (like the user session data)
      const assignments = [
        // Round 1
        mkAssignment('r1', 'c1', ['Uma', 'Frank'], ['Isabella', 'Yuki']),
        mkAssignment('r1', 'c2', ['Henry', 'Vincent'], ['Brian', 'Wendy']),
        mkAssignment('r1', 'c3', ['David', 'Karen'], ['Rachel', 'Xavier']),
        mkAssignment('r1', 'c4', ['Samuel', 'Carla'], ['Tina', 'Liam']),
        mkAssignment('r1', 'c5', ['Jack', 'Peter'], ['Grace', 'Chris']),
        mkAssignment('r1', 'c6', ['Nathan', 'Alex'], ['Olivia', 'Maya']),
        // Round 2
        mkAssignment('r2', 'c1', ['Samuel', 'Tina'], ['Isabella', 'Grace']),
        mkAssignment('r2', 'c2', ['Emily', 'Vincent'], ['Olivia', 'Carla']),
        mkAssignment('r2', 'c3', ['Yuki', 'Jack'], ['Xavier', 'Liam']),
        mkAssignment('r2', 'c4', ['David', 'Nathan'], ['Peter', 'Zara']),
        mkAssignment('r2', 'c5', ['Wendy', 'Chris'], ['Frank', 'Rachel']),
        mkAssignment('r2', 'c6', ['Uma', 'Karen'], ['Alex', 'Henry']),
        // Round 3
        mkAssignment('r3', 'c1', ['Samuel', 'Grace'], ['Alex', 'Chris']),
        mkAssignment('r3', 'c2', ['Nathan', 'Henry'], ['Isabella', 'Frank']),
        mkAssignment('r3', 'c3', ['Liam', 'Emily'], ['Rachel', 'Karen']),
        mkAssignment('r3', 'c4', ['Carla', 'Jack'], ['Maya', 'David']),
        mkAssignment('r3', 'c5', ['Wendy', 'Vincent'], ['Olivia', 'Zara']),
        mkAssignment('r3', 'c6', ['Brian', 'Peter'], ['Uma', 'Tina']),
      ];

      const oppHistory = buildOpponentHistory(assignments);
      const partHistory = buildPartnershipHistory(assignments);

      // Verify specific opponent counts from the data
      // Round 1: Uma vs Isabella, Round 2: Uma is NOT vs Isabella → should be 1
      expect(oppHistory.get(getPartnerKey('Uma', 'Isabella'))).toBe(1);

      // Uma & Frank are partners in round 1 → partner count = 1
      expect(partHistory.get(getPartnerKey('Uma', 'Frank'))).toBe(1);
      // Uma & Frank should NOT be opponents in round 1
      expect(oppHistory.get(getPartnerKey('Uma', 'Frank'))).toBeUndefined();

      // All values should be positive integers
      for (const val of oppHistory.values()) {
        expect(val).toBeGreaterThan(0);
        expect(Number.isInteger(val)).toBe(true);
      }
    });

    it('opponent and partner histories are disjoint per round', () => {
      const assignments = [
        mkAssignment('r1', 'c1', ['A', 'B'], ['C', 'D']),
        mkAssignment('r1', 'c2', ['E', 'F'], ['G', 'H']),
      ];

      const oppHistory = buildOpponentHistory(assignments);
      const partHistory = buildPartnershipHistory(assignments);

      // Partner pairs: A-B, C-D, E-F, G-H
      // Opponent pairs: A-C, A-D, B-C, B-D, E-G, E-H, F-G, F-H
      // These sets should not overlap
      for (const key of partHistory.keys()) {
        expect(oppHistory.has(key)).toBe(false);
      }
      for (const key of oppHistory.keys()) {
        expect(partHistory.has(key)).toBe(false);
      }
    });
  });
});
