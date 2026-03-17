import {
  getPartnerKey,
  buildPartnershipHistory,
  scoreSplit,
  optimizeTeamSplit,
} from '../localStorageApi';
import { Player, Assignment } from '../../types';

// Helper to create a Player object
function mkPlayer(id: string): Player {
  return { id, leagueId: 'l1', name: `Player ${id}`, createdAt: new Date() };
}

// Helper to create an Assignment object
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

describe('Partner Uniqueness - Frontend', () => {
  describe('getPartnerKey', () => {
    it('returns the same key regardless of argument order', () => {
      expect(getPartnerKey('a', 'b')).toBe(getPartnerKey('b', 'a'));
    });

    it('produces a canonical key with lexicographic ordering', () => {
      expect(getPartnerKey('z', 'a')).toBe('a_z');
      expect(getPartnerKey('alice', 'bob')).toBe('alice_bob');
    });

    it('handles identical prefixes correctly', () => {
      expect(getPartnerKey('abc', 'abd')).toBe('abc_abd');
    });
  });

  describe('buildPartnershipHistory', () => {
    it('returns an empty map when input is undefined', () => {
      expect(buildPartnershipHistory(undefined).size).toBe(0);
    });

    it('returns an empty map when input is empty', () => {
      expect(buildPartnershipHistory([]).size).toBe(0);
    });

    it('counts pairs correctly for a single court assignment', () => {
      const assignments = [mkAssignment('r1', 'c1', ['a', 'b'], ['c', 'd'])];
      const history = buildPartnershipHistory(assignments);
      expect(history.get(getPartnerKey('a', 'b'))).toBe(1);
      expect(history.get(getPartnerKey('c', 'd'))).toBe(1);
      // Cross-team pairs should not be counted
      expect(history.get(getPartnerKey('a', 'c'))).toBeUndefined();
    });

    it('accumulates counts across multiple rounds', () => {
      const assignments = [
        mkAssignment('r1', 'c1', ['a', 'b'], ['c', 'd']),
        mkAssignment('r2', 'c1', ['a', 'b'], ['c', 'd']),
      ];
      const history = buildPartnershipHistory(assignments);
      expect(history.get(getPartnerKey('a', 'b'))).toBe(2);
    });

    it('tracks players on different teams across rounds independently', () => {
      const assignments = [
        mkAssignment('r1', 'c1', ['a', 'b'], ['c', 'd']),
        mkAssignment('r2', 'c1', ['a', 'c'], ['b', 'd']),
      ];
      const history = buildPartnershipHistory(assignments);
      expect(history.get(getPartnerKey('a', 'b'))).toBe(1);
      expect(history.get(getPartnerKey('a', 'c'))).toBe(1);
      expect(history.get(getPartnerKey('b', 'd'))).toBe(1);
      expect(history.get(getPartnerKey('c', 'd'))).toBe(1);
    });

    it('only contains non-negative integer values', () => {
      const assignments = [
        mkAssignment('r1', 'c1', ['a', 'b'], ['c', 'd']),
        mkAssignment('r2', 'c1', ['a', 'b'], ['c', 'd']),
      ];
      const history = buildPartnershipHistory(assignments);
      for (const val of history.values()) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(val)).toBe(true);
      }
    });
  });

  describe('scoreSplit', () => {
    it('returns 0 when partnership history is empty', () => {
      expect(scoreSplit(['a', 'b'], ['c', 'd'], new Map())).toBe(0);
    });

    it('sums within-team pair counts from both teams', () => {
      const history = new Map<string, number>();
      history.set(getPartnerKey('a', 'b'), 2);
      history.set(getPartnerKey('c', 'd'), 3);
      expect(scoreSplit(['a', 'b'], ['c', 'd'], history)).toBe(5);
    });

    it('defaults to 0 for pairs not in the map', () => {
      const history = new Map<string, number>();
      history.set(getPartnerKey('a', 'b'), 1);
      // c_d not in map
      expect(scoreSplit(['a', 'b'], ['c', 'd'], history)).toBe(1);
    });

    it('does not count cross-team pairs', () => {
      const history = new Map<string, number>();
      history.set(getPartnerKey('a', 'c'), 10); // cross-team
      expect(scoreSplit(['a', 'b'], ['c', 'd'], history)).toBe(0);
    });

    it('only considers pairs where both players are in the provided team arrays', () => {
      const history = new Map<string, number>();
      history.set(getPartnerKey('a', 'x'), 5); // x not in either team
      history.set(getPartnerKey('a', 'b'), 1);
      expect(scoreSplit(['a', 'b'], ['c', 'd'], history)).toBe(1);
    });
  });

  describe('optimizeTeamSplit', () => {
    it('returns a valid 2v2 split when all pairs have zero history', () => {
      const players = ['a', 'b', 'c', 'd'].map(mkPlayer);
      const [t1, t2] = optimizeTeamSplit(players, new Map());
      expect(t1.length).toBe(2);
      expect(t2.length).toBe(2);
      expect(new Set([...t1, ...t2]).size).toBe(4);
    });

    it('chooses the split with the lowest score when one is clearly better', () => {
      const players = ['a', 'b', 'c', 'd'].map(mkPlayer);
      const history = new Map<string, number>();
      // Make a+b and c+d expensive
      history.set(getPartnerKey('a', 'b'), 5);
      history.set(getPartnerKey('c', 'd'), 5);
      // Make a+c and b+d expensive
      history.set(getPartnerKey('a', 'c'), 5);
      history.set(getPartnerKey('b', 'd'), 5);
      // Leave a+d and b+c at 0 — split 3 is clearly best
      const [t1, t2] = optimizeTeamSplit(players, history);
      const teams = [t1.sort(), t2.sort()].sort();
      expect(teams).toEqual([['a', 'd'], ['b', 'c']]);
    });

    it('chooses one of the tied splits (not the worse one)', () => {
      const players = ['a', 'b', 'c', 'd'].map(mkPlayer);
      const history = new Map<string, number>();
      // Make split 1 ({a,b} vs {c,d}) expensive
      history.set(getPartnerKey('a', 'b'), 10);
      history.set(getPartnerKey('c', 'd'), 10);
      // Splits 2 and 3 are tied at 0
      const [t1, t2] = optimizeTeamSplit(players, history);
      const score = scoreSplit(t1, t2, history);
      expect(score).toBe(0);
    });

    it('returns a valid split when all splits have equal score', () => {
      const players = ['a', 'b', 'c', 'd'].map(mkPlayer);
      const history = new Map<string, number>();
      // All pairs have same count
      for (const p1 of ['a', 'b', 'c', 'd']) {
        for (const p2 of ['a', 'b', 'c', 'd']) {
          if (p1 < p2) history.set(getPartnerKey(p1, p2), 1);
        }
      }
      const [t1, t2] = optimizeTeamSplit(players, history);
      expect(t1.length).toBe(2);
      expect(t2.length).toBe(2);
      expect(new Set([...t1, ...t2]).size).toBe(4);
    });

    it('still returns a valid split when all pairings have high counts', () => {
      const players = ['a', 'b', 'c', 'd'].map(mkPlayer);
      const history = new Map<string, number>();
      for (const p1 of ['a', 'b', 'c', 'd']) {
        for (const p2 of ['a', 'b', 'c', 'd']) {
          if (p1 < p2) history.set(getPartnerKey(p1, p2), 100);
        }
      }
      const [t1, t2] = optimizeTeamSplit(players, history);
      expect(t1.length).toBe(2);
      expect(t2.length).toBe(2);
    });
  });

  describe('Integration - multi-round partner variety via api', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('second round avoids first round pairings when using the full api', async () => {
      const { api } = require('../localStorageApi');

      // Create a league with 4 players and 1 court
      const league = await api.createLeague('Test');
      await api.addPlayer(league.id, 'Alice');
      await api.addPlayer(league.id, 'Bob');
      await api.addPlayer(league.id, 'Carol');
      await api.addPlayer(league.id, 'Dave');
      await api.addCourt(league.id, 'Court 1');

      // Generate two rounds
      const round1 = await api.generateRound(league.id);
      const round2 = await api.generateRound(league.id);

      const a1 = await api.getAssignments(round1.id);
      const a2 = await api.getAssignments(round2.id);

      // Both rounds should have exactly 1 assignment (1 court, 4 players)
      expect(a1.length).toBe(1);
      expect(a2.length).toBe(1);

      // Extract team pairs from each round
      const r1Team1 = [...a1[0].team1PlayerIds].sort();
      const r1Team2 = [...a1[0].team2PlayerIds].sort();
      const r2Team1 = [...a2[0].team1PlayerIds].sort();
      const r2Team2 = [...a2[0].team2PlayerIds].sort();

      // The second round should have different team pairings
      // (with only 3 possible splits and history-aware optimization, it should pick a different one)
      const sameTeams =
        (r1Team1.join() === r2Team1.join() && r1Team2.join() === r2Team2.join()) ||
        (r1Team1.join() === r2Team2.join() && r1Team2.join() === r2Team1.join());
      expect(sameTeams).toBe(false);
    });

    it('three rounds with 4 players cycle through all 3 possible splits', async () => {
      const { api } = require('../localStorageApi');

      const league = await api.createLeague('Test');
      await api.addPlayer(league.id, 'A');
      await api.addPlayer(league.id, 'B');
      await api.addPlayer(league.id, 'C');
      await api.addPlayer(league.id, 'D');
      await api.addCourt(league.id, 'Court 1');

      const rounds = [];
      for (let i = 0; i < 3; i++) {
        rounds.push(await api.generateRound(league.id));
      }

      const teamPairs = [];
      for (const round of rounds) {
        const assignments = await api.getAssignments(round.id);
        const t1 = [...assignments[0].team1PlayerIds].sort().join(',');
        const t2 = [...assignments[0].team2PlayerIds].sort().join(',');
        // Normalize: always put the lexicographically smaller team first
        teamPairs.push(t1 < t2 ? `${t1}|${t2}` : `${t2}|${t1}`);
      }

      // All 3 rounds should have unique team pairings
      const uniquePairs = new Set(teamPairs);
      expect(uniquePairs.size).toBe(3);
    });
  });
});
