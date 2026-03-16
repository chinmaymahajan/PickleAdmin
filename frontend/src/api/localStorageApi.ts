/**
 * localStorage-backed API — replaces the Express backend entirely.
 * All data lives in the browser. Same interface as the HTTP api client.
 */
import { League, Player, Court, Round, Assignment, LeagueFormat } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function shuffle<T>(array: T[]): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Storage helpers ──────────────────────────────────────────────────────────

const STORE_KEY = 'pickleadmin_data';

interface Store {
  leagues: League[];
  players: Player[];
  courts: Court[];
  rounds: Round[];
  assignments: Assignment[];
}

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { leagues: [], players: [], courts: [], rounds: [], assignments: [] };
}

function saveStore(store: Store): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

// ── Assignment generation (ported from backend AssignmentService) ────────────

function createAssignments(
  players: Player[],
  courts: Court[],
  roundId: string,
  playersPerCourt: number,
  byeCountMap: Map<string, number>
): Assignment[] {
  const playersNeeded = Math.min(players.length, courts.length * playersPerCourt);
  const fullCourts = Math.floor(playersNeeded / playersPerCourt);
  const slotsToFill = fullCourts * playersPerCourt;

  // Group by bye count
  const groups = new Map<number, Player[]>();
  for (const p of players) {
    const count = byeCountMap.get(p.id) || 0;
    if (!groups.has(count)) groups.set(count, []);
    groups.get(count)!.push(p);
  }

  // Most byes first (priority to play)
  const sortedCounts = [...groups.keys()].sort((a, b) => b - a);
  const ordered: Player[] = [];
  for (const count of sortedCounts) {
    ordered.push(...shuffle(groups.get(count)!));
  }

  const playersToAssign = ordered.slice(0, slotsToFill);
  const finalOrder = shuffle(playersToAssign);
  const shuffledCourts = shuffle([...courts]);

  const assignments: Assignment[] = [];
  let idx = 0;

  for (const court of shuffledCourts) {
    const cp = finalOrder.slice(idx, idx + playersPerCourt);
    if (cp.length === playersPerCourt) {
      const half = playersPerCourt / 2;
      assignments.push({
        id: generateId(),
        roundId,
        courtId: court.id,
        team1PlayerIds: cp.slice(0, half).map(p => p.id),
        team2PlayerIds: cp.slice(half).map(p => p.id),
        createdAt: new Date(),
      });
    }
    idx += playersPerCourt;
    if (idx >= finalOrder.length) break;
  }
  return assignments;
}

function areTeamCompositionsIdentical(a: Assignment[], b: Assignment[]): boolean {
  const extract = (arr: Assignment[]) => {
    const teams: string[][] = [];
    for (const x of arr) {
      teams.push([...x.team1PlayerIds].sort());
      teams.push([...x.team2PlayerIds].sort());
    }
    return teams;
  };
  const newT = extract(a);
  const prevT = extract(b);
  if (newT.length !== prevT.length) return false;
  return newT.every(nt => prevT.some(pt => pt.length === nt.length && pt.every((v, i) => v === nt[i])));
}

function generateAssignments(
  players: Player[],
  courts: Court[],
  roundId: string,
  byeCountMap: Map<string, number>,
  previousAssignments?: Assignment[]
): Assignment[] {
  let attempts = 0;
  let assignments: Assignment[] = [];
  while (attempts < 10) {
    assignments = createAssignments(players, courts, roundId, 4, byeCountMap);
    if (!previousAssignments || previousAssignments.length === 0) break;
    if (!areTeamCompositionsIdentical(assignments, previousAssignments)) break;
    attempts++;
  }
  return assignments;
}

// ── Round generation (ported from backend RoundService) ─────────────────────

function generateRoundForLeague(store: Store, leagueId: string): { round: Round; newAssignments: Assignment[] } {
  const players = store.players.filter(p => p.leagueId === leagueId);
  const courts = store.courts.filter(c => c.leagueId === leagueId);
  if (players.length === 0) throw new Error('Cannot generate round: no players in session');
  if (courts.length === 0) throw new Error('Cannot generate round: no courts in session');

  const existingRounds = store.rounds.filter(r => r.leagueId === leagueId).sort((a, b) => a.roundNumber - b.roundNumber);
  const nextNum = existingRounds.length > 0 ? Math.max(...existingRounds.map(r => r.roundNumber)) + 1 : 1;

  const round: Round = { id: generateId(), leagueId, roundNumber: nextNum, createdAt: new Date() };

  // Compute bye counts
  const byeCountMap = new Map<string, number>();
  for (const p of players) byeCountMap.set(p.id, 0);
  for (const prev of existingRounds) {
    const ra = store.assignments.filter(a => a.roundId === prev.id);
    const assigned = new Set<string>();
    for (const a of ra) {
      a.team1PlayerIds.forEach(id => assigned.add(id));
      a.team2PlayerIds.forEach(id => assigned.add(id));
    }
    for (const p of players) {
      if (!assigned.has(p.id)) byeCountMap.set(p.id, (byeCountMap.get(p.id) || 0) + 1);
    }
  }

  // Previous round assignments for variety
  let prevAssignments: Assignment[] | undefined;
  if (existingRounds.length > 0) {
    const lastRound = existingRounds[existingRounds.length - 1];
    prevAssignments = store.assignments.filter(a => a.roundId === lastRound.id);
  }

  const newAssignments = generateAssignments(players, courts, round.id, byeCountMap, prevAssignments);
  return { round, newAssignments };
}

// ── Public API (same interface as HTTP client) ──────────────────────────────

export const api = {
  // League
  async createLeague(name: string, format: LeagueFormat = LeagueFormat.ROUND_ROBIN): Promise<League> {
    const store = loadStore();
    if (store.leagues.length >= 10) throw new Error('Maximum of 10 active sessions reached');
    const now = new Date();
    const league: League = { id: generateId(), name, format, createdAt: now, updatedAt: now };
    store.leagues.push(league);
    saveStore(store);
    return league;
  },

  async listLeagues(): Promise<League[]> {
    return loadStore().leagues;
  },

  async getLeague(leagueId: string): Promise<League> {
    const league = loadStore().leagues.find(l => l.id === leagueId);
    if (!league) throw new Error('League not found');
    return league;
  },

  async selectLeague(_leagueId: string): Promise<void> {
    // No-op in client mode — selection is handled in App state
  },

  async deleteLeague(leagueId: string): Promise<void> {
    const store = loadStore();
    const idx = store.leagues.findIndex(l => l.id === leagueId);
    if (idx === -1) throw new Error('League not found');
    // Cascade delete
    const roundIds = store.rounds.filter(r => r.leagueId === leagueId).map(r => r.id);
    store.assignments = store.assignments.filter(a => !roundIds.includes(a.roundId));
    store.rounds = store.rounds.filter(r => r.leagueId !== leagueId);
    store.players = store.players.filter(p => p.leagueId !== leagueId);
    store.courts = store.courts.filter(c => c.leagueId !== leagueId);
    store.leagues.splice(idx, 1);
    saveStore(store);
  },

  // Players
  async addPlayer(leagueId: string, name: string): Promise<Player> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Player name is required');
    if (trimmed.length > 50) throw new Error('Player name must be 50 characters or less');
    const store = loadStore();
    const existing = store.players.filter(p => p.leagueId === leagueId);
    if (existing.length >= 100) throw new Error('Maximum of 100 players per session reached');
    const player: Player = { id: generateId(), leagueId, name: trimmed, createdAt: new Date() };
    store.players.push(player);
    saveStore(store);
    return player;
  },

  async getPlayers(leagueId: string): Promise<Player[]> {
    return loadStore().players.filter(p => p.leagueId === leagueId);
  },

  async deletePlayer(playerId: string): Promise<void> {
    const store = loadStore();
    store.players = store.players.filter(p => p.id !== playerId);
    saveStore(store);
  },

  // Courts
  async addCourt(leagueId: string, identifier: string): Promise<Court> {
    const trimmed = identifier.trim();
    if (!trimmed) throw new Error('Court identifier is required');
    const store = loadStore();
    const existing = store.courts.filter(c => c.leagueId === leagueId);
    if (existing.length >= 30) throw new Error('Maximum of 30 courts per session reached');
    if (existing.some(c => c.identifier === trimmed)) throw new Error(`Court "${trimmed}" already exists`);
    const court: Court = { id: generateId(), leagueId, identifier: trimmed, createdAt: new Date() };
    store.courts.push(court);
    saveStore(store);
    return court;
  },

  async getCourts(leagueId: string): Promise<Court[]> {
    return loadStore().courts.filter(c => c.leagueId === leagueId);
  },

  async deleteCourt(courtId: string): Promise<void> {
    const store = loadStore();
    store.courts = store.courts.filter(c => c.id !== courtId);
    saveStore(store);
  },

  // Rounds
  async generateRound(leagueId: string): Promise<Round> {
    const store = loadStore();
    const { round, newAssignments } = generateRoundForLeague(store, leagueId);
    store.rounds.push(round);
    store.assignments.push(...newAssignments);
    saveStore(store);
    return round;
  },

  async regenerateFutureRounds(leagueId: string, afterRoundNumber: number): Promise<Round[]> {
    const store = loadStore();
    const allRounds = store.rounds.filter(r => r.leagueId === leagueId).sort((a, b) => a.roundNumber - b.roundNumber);
    const roundsToDelete = allRounds.filter(r => r.roundNumber > afterRoundNumber);
    const numToRegenerate = roundsToDelete.length;

    // Delete future rounds and their assignments
    const deleteIds = new Set(roundsToDelete.map(r => r.id));
    store.assignments = store.assignments.filter(a => !deleteIds.has(a.roundId));
    store.rounds = store.rounds.filter(r => !deleteIds.has(r.id));

    // Regenerate
    for (let i = 0; i < numToRegenerate; i++) {
      const { round, newAssignments } = generateRoundForLeague(store, leagueId);
      store.rounds.push(round);
      store.assignments.push(...newAssignments);
    }
    saveStore(store);
    return store.rounds.filter(r => r.leagueId === leagueId).sort((a, b) => a.roundNumber - b.roundNumber);
  },

  async listRounds(leagueId: string): Promise<Round[]> {
    return loadStore().rounds.filter(r => r.leagueId === leagueId).sort((a, b) => a.roundNumber - b.roundNumber);
  },

  async getRound(leagueId: string, roundNumber: number): Promise<Round> {
    const round = loadStore().rounds.find(r => r.leagueId === leagueId && r.roundNumber === roundNumber);
    if (!round) throw new Error('Round not found');
    return round;
  },

  async getCurrentRound(leagueId: string): Promise<Round> {
    const rounds = loadStore().rounds.filter(r => r.leagueId === leagueId).sort((a, b) => a.roundNumber - b.roundNumber);
    if (rounds.length === 0) throw new Error('No rounds found for league');
    return rounds[rounds.length - 1];
  },

  async clearRounds(leagueId: string): Promise<void> {
    const store = loadStore();
    const roundIds = new Set(store.rounds.filter(r => r.leagueId === leagueId).map(r => r.id));
    store.assignments = store.assignments.filter(a => !roundIds.has(a.roundId));
    store.rounds = store.rounds.filter(r => r.leagueId !== leagueId);
    saveStore(store);
  },

  // Assignments
  async getAssignments(roundId: string): Promise<Assignment[]> {
    return loadStore().assignments.filter(a => a.roundId === roundId);
  },

  async getByeCounts(leagueId: string): Promise<Record<string, number>> {
    const store = loadStore();
    const players = store.players.filter(p => p.leagueId === leagueId);
    const rounds = store.rounds.filter(r => r.leagueId === leagueId);
    const counts: Record<string, number> = {};
    for (const p of players) counts[p.id] = 0;
    for (const round of rounds) {
      const ra = store.assignments.filter(a => a.roundId === round.id);
      const assigned = new Set<string>();
      for (const a of ra) {
        a.team1PlayerIds.forEach(id => assigned.add(id));
        a.team2PlayerIds.forEach(id => assigned.add(id));
      }
      for (const p of players) {
        if (!assigned.has(p.id)) counts[p.id]++;
      }
    }
    return counts;
  },

  async updateAssignments(
    roundId: string,
    assignments: Array<{ courtId: string; team1PlayerIds: string[]; team2PlayerIds: string[] }>
  ): Promise<Assignment[]> {
    const store = loadStore();
    for (const manual of assignments) {
      const existing = store.assignments.find(a => a.roundId === roundId && a.courtId === manual.courtId);
      if (existing) {
        existing.team1PlayerIds = manual.team1PlayerIds;
        existing.team2PlayerIds = manual.team2PlayerIds;
      } else {
        store.assignments.push({
          id: generateId(),
          roundId,
          courtId: manual.courtId,
          team1PlayerIds: manual.team1PlayerIds,
          team2PlayerIds: manual.team2PlayerIds,
          createdAt: new Date(),
        });
      }
    }
    saveStore(store);
    return store.assignments.filter(a => a.roundId === roundId);
  },

  // Dev tools
  async seedMockData(): Promise<{ league: League; players: number; courts: number }> {
    const store = loadStore();
    const now = new Date();
    const league: League = { id: generateId(), name: 'Morning Open Play', format: LeagueFormat.ROUND_ROBIN, createdAt: now, updatedAt: now };
    store.leagues.push(league);

    const names = [
      'Alex Johnson', 'Brian Lee', 'Carla Mendes', 'David Kim', 'Emily Carter',
      'Frank Miller', 'Grace Lin', 'Henry Patel', 'Isabella Torres', 'Jack Wilson',
      'Karen Brooks', 'Liam OConnor', 'Maya Singh', 'Nathan Green', 'Olivia Park',
      'Peter Novak', 'Rachel Adams', 'Samuel Ortiz', 'Tina Zhang', 'Vincent Rossi',
      'Wendy Chen', 'Xavier Morales', 'Yuki Tanaka', 'Zara Ahmed', 'Chris Harper', 'Uma Desai',
    ];
    for (const name of names) {
      store.players.push({ id: generateId(), leagueId: league.id, name, createdAt: now });
    }
    for (let i = 1; i <= 6; i++) {
      store.courts.push({ id: generateId(), leagueId: league.id, identifier: `Court ${i}`, createdAt: now });
    }
    saveStore(store);
    return { league, players: names.length, courts: 6 };
  },

  async clearAllData(): Promise<void> {
    localStorage.removeItem(STORE_KEY);
  },
};
