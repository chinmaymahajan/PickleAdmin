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

// Real player names from Open Play - DUPR league
const DUPR_PLAYERS = [
  'Aimee Crant Oksa', 'Anand Subramani', 'Angela Evans', 'Anthony Calamusa',
  'Barbara OConnor', 'Bob Howard', 'Chairmaine Ng', 'Chinmay Mahajan',
  'Dawne MC', 'Dennis Clarke', 'Diane Cuce', 'Douglas Sr. Fallon',
  'Gannon Meyer', 'John F', 'Joseph Altomonte', 'Katie Workman',
  'Michael Lacqua', 'Mike Vidal', 'Morgan Biancamano', 'Paul Capaldo',
  'Paul Kelahan', 'Ram seridana', 'Sebastian Filipkowski', 'Shiba M',
  'Vera Koshkina', 'Xiaomei Yin', 'Yan Guo',
];

// Real court names from the venue
const DUPR_COURTS = [
  'Court #5', 'Court #6', 'Court #8', 'Court #9',
  'Court #11', 'Court #12', 'Court #13',
];

describe('Opponent Uniqueness - Frontend', () => {
  describe('buildOpponentHistory', () => {
    it('returns empty map for undefined input', () => {
      expect(buildOpponentHistory(undefined).size).toBe(0);
    });

    it('returns empty map for empty array', () => {
      expect(buildOpponentHistory([]).size).toBe(0);
    });

    it('counts cross-team pairs as opponents', () => {
      const assignments = [mkAssignment('r1', 'c5', ['A', 'B'], ['C', 'D'])];
      const history = buildOpponentHistory(assignments);

      expect(history.get(getPartnerKey('A', 'C'))).toBe(1);
      expect(history.get(getPartnerKey('A', 'D'))).toBe(1);
      expect(history.get(getPartnerKey('B', 'C'))).toBe(1);
      expect(history.get(getPartnerKey('B', 'D'))).toBe(1);
      expect(history.size).toBe(4);
    });

    it('does NOT count within-team pairs as opponents', () => {
      const assignments = [mkAssignment('r1', 'c5', ['A', 'B'], ['C', 'D'])];
      const history = buildOpponentHistory(assignments);

      expect(history.has(getPartnerKey('A', 'B'))).toBe(false);
      expect(history.has(getPartnerKey('C', 'D'))).toBe(false);
    });

    it('accumulates opponent counts across rounds', () => {
      const assignments = [
        mkAssignment('r1', 'c5', ['A', 'B'], ['C', 'D']),
        mkAssignment('r2', 'c5', ['A', 'B'], ['C', 'D']),
      ];
      const history = buildOpponentHistory(assignments);

      expect(history.get(getPartnerKey('A', 'C'))).toBe(2);
      expect(history.get(getPartnerKey('B', 'D'))).toBe(2);
    });

    it('tracks different opponent pairings across rounds', () => {
      const assignments = [
        mkAssignment('r1', 'c5', ['A', 'B'], ['C', 'D']),
        mkAssignment('r2', 'c5', ['A', 'C'], ['B', 'D']),
      ];
      const history = buildOpponentHistory(assignments);

      expect(history.get(getPartnerKey('A', 'C'))).toBe(1);
      expect(history.get(getPartnerKey('A', 'D'))).toBe(2);
      expect(history.get(getPartnerKey('A', 'B'))).toBe(1);
      expect(history.get(getPartnerKey('C', 'D'))).toBe(1);
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

      opponentHistory.set(getPartnerKey('A', 'C'), 10);
      opponentHistory.set(getPartnerKey('B', 'D'), 10);
      opponentHistory.set(getPartnerKey('A', 'D'), 10);
      opponentHistory.set(getPartnerKey('B', 'C'), 10);

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

  describe('real-world simulation: 27 players, 7 courts (Open Play - DUPR)', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('should minimize opponent repeats over 10 rounds', async () => {
      const { api } = require('../localStorageApi');

      const league = await api.createLeague('Open Play - DUPR');
      for (const name of DUPR_PLAYERS) {
        await api.addPlayer(league.id, name);
      }
      for (const court of DUPR_COURTS) {
        await api.addCourt(league.id, court);
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

      // 27 players, 7 courts, 10 rounds
      expect(maxOpponentRepeat).toBeLessThanOrEqual(4);
      expect(pairsOver2).toBeLessThan(30);
    });

    it('should minimize partner repeats over 10 rounds', async () => {
      const { api } = require('../localStorageApi');

      const league = await api.createLeague('Open Play - DUPR');
      for (const name of DUPR_PLAYERS) {
        await api.addPlayer(league.id, name);
      }
      for (const court of DUPR_COURTS) {
        await api.addCourt(league.id, court);
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
      expect(maxPartnerRepeat).toBeLessThanOrEqual(3);
    });

    it('should keep opponent repeats reasonable over 17 rounds', async () => {
      const { api } = require('../localStorageApi');

      const league = await api.createLeague('Open Play - DUPR');
      for (const name of DUPR_PLAYERS) {
        await api.addPlayer(league.id, name);
      }
      for (const court of DUPR_COURTS) {
        await api.addCourt(league.id, court);
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

      const opponentCounts = new Map<string, number>();
      for (const a of allAssignments) {
        for (const p1 of a.team1PlayerIds) {
          for (const p2 of a.team2PlayerIds) {
            const key = getPartnerKey(p1, p2);
            opponentCounts.set(key, (opponentCounts.get(key) ?? 0) + 1);
          }
        }
      }

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

      expect(maxOpponent).toBeLessThanOrEqual(5);
      expect(maxPartner).toBeLessThanOrEqual(3);
      expect(opponent4xPlus).toBeLessThan(10);
    });
  });

  describe('opponent history with realistic multi-court data', () => {
    it('buildOpponentHistory correctly counts from DUPR session-like data', () => {
      const assignments = [
        // Round 1 — 7 courts
        mkAssignment('r1', 'c5', ['Chinmay', 'Anand'], ['Angela', 'Bob']),
        mkAssignment('r1', 'c6', ['Anthony', 'Barbara'], ['Chairmaine', 'Dawne']),
        mkAssignment('r1', 'c8', ['Dennis', 'Diane'], ['Douglas', 'Gannon']),
        mkAssignment('r1', 'c9', ['John', 'Joseph'], ['Katie', 'Michael']),
        mkAssignment('r1', 'c11', ['Mike', 'Morgan'], ['Paul C', 'Paul K']),
        mkAssignment('r1', 'c12', ['Ram', 'Sebastian'], ['Shiba', 'Vera']),
        mkAssignment('r1', 'c13', ['Xiaomei', 'Yan'], ['Aimee', 'Diane']),
        // Round 2
        mkAssignment('r2', 'c5', ['Bob', 'Chairmaine'], ['Dennis', 'Gannon']),
        mkAssignment('r2', 'c6', ['Angela', 'Joseph'], ['Morgan', 'Vera']),
        mkAssignment('r2', 'c8', ['Anand', 'Katie'], ['Sebastian', 'Yan']),
        mkAssignment('r2', 'c9', ['Chinmay', 'Douglas'], ['Mike', 'Ram']),
        mkAssignment('r2', 'c11', ['Barbara', 'Diane'], ['Paul C', 'Xiaomei']),
        mkAssignment('r2', 'c12', ['Anthony', 'Dawne'], ['John', 'Shiba']),
        mkAssignment('r2', 'c13', ['Michael', 'Paul K'], ['Aimee', 'Gannon']),
      ];

      const oppHistory = buildOpponentHistory(assignments);
      const partHistory = buildPartnershipHistory(assignments);

      // Chinmay & Anand are partners in round 1 → partner count = 1
      expect(partHistory.get(getPartnerKey('Chinmay', 'Anand'))).toBe(1);
      // Chinmay vs Angela in round 1 → opponent count = 1
      expect(oppHistory.get(getPartnerKey('Chinmay', 'Angela'))).toBe(1);
      // Chinmay & Anand should NOT be opponents
      expect(oppHistory.get(getPartnerKey('Chinmay', 'Anand'))).toBeUndefined();

      for (const val of oppHistory.values()) {
        expect(val).toBeGreaterThan(0);
        expect(Number.isInteger(val)).toBe(true);
      }
    });

    it('opponent and partner histories are disjoint per round', () => {
      const assignments = [
        mkAssignment('r1', 'c5', ['A', 'B'], ['C', 'D']),
        mkAssignment('r1', 'c6', ['E', 'F'], ['G', 'H']),
      ];

      const oppHistory = buildOpponentHistory(assignments);
      const partHistory = buildPartnershipHistory(assignments);

      for (const key of partHistory.keys()) {
        expect(oppHistory.has(key)).toBe(false);
      }
      for (const key of oppHistory.keys()) {
        expect(partHistory.has(key)).toBe(false);
      }
    });
  });
});
