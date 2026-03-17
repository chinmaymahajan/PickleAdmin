import { app, request, resetState } from './helpers';
import fc from 'fast-check';

// Arbitrary: random alphanumeric league name (1-50 chars)
const leagueNameArb = fc.stringMatching(/^[a-zA-Z0-9]{1,50}$/);

// Arbitrary: random alphanumeric player name (1-30 chars)
const playerNameArb = fc.stringMatching(/^[a-zA-Z0-9]{1,30}$/);

// Arbitrary: random alphanumeric court identifier (1-30 chars)
const courtIdentifierArb = fc.stringMatching(/^[a-zA-Z0-9]{1,30}$/);

// The only valid format currently
const leagueFormatArb = fc.constant('round_robin' as const);

describe('Property-Based Integration Tests', () => {
  let server: any;

  beforeAll((done) => {
    server = app.listen(0, () => done());
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    resetState();
  });

  // Feature: e2e-integration-tests, Property 1: League create-then-retrieve round trip
  // **Validates: Requirements 1.1, 1.2, 1.3, 1.5**
  describe('Property 1: League create-then-retrieve round trip', () => {
    it('creating a league and retrieving it by ID should return the same name and format, and listing should include it', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, leagueFormatArb, async (name, format) => {
          resetState();
          const createRes = await request(server).post('/api/leagues').send({ name, format });
          expect(createRes.status).toBe(201);
          expect(createRes.body.id).toBeDefined();
          expect(createRes.body.name).toBe(name);
          expect(createRes.body.format).toBe(format);

          const leagueId = createRes.body.id;

          const getRes = await request(server).get(`/api/leagues/${leagueId}`);
          expect(getRes.status).toBe(200);
          expect(getRes.body.id).toBe(leagueId);
          expect(getRes.body.name).toBe(name);
          expect(getRes.body.format).toBe(format);

          const listRes = await request(server).get('/api/leagues');
          expect(listRes.status).toBe(200);
          expect(Array.isArray(listRes.body)).toBe(true);
          const found = listRes.body.find((l: any) => l.id === leagueId);
          expect(found).toBeDefined();
          expect(found.name).toBe(name);
          expect(found.format).toBe(format);
        }),
        { numRuns: 100 }
      );
    }, 60000);
  });

  // Feature: e2e-integration-tests, Property 2: Player add-then-list round trip
  // **Validates: Requirements 2.1, 2.2**
  describe('Property 2: Player add-then-list round trip', () => {
    it('adding a player to a league and listing players should include that player with correct fields', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, playerNameArb, async (leagueName, playerName) => {
          resetState();
          const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
          expect(leagueRes.status).toBe(201);
          const leagueId = leagueRes.body.id;

          const addRes = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name: playerName });
          expect(addRes.status).toBe(201);
          expect(addRes.body.id).toBeDefined();
          expect(addRes.body.leagueId).toBe(leagueId);
          expect(addRes.body.name).toBe(playerName);
          expect(addRes.body.createdAt).toBeDefined();

          const listRes = await request(server).get(`/api/leagues/${leagueId}/players`);
          expect(listRes.status).toBe(200);
          expect(Array.isArray(listRes.body)).toBe(true);
          const found = listRes.body.find((p: any) => p.id === addRes.body.id);
          expect(found).toBeDefined();
          expect(found.name).toBe(playerName);
          expect(found.leagueId).toBe(leagueId);
        }),
        { numRuns: 100 }
      );
    }, 60000);
  });

  // Feature: e2e-integration-tests, Property 3: Player delete removes from list
  // **Validates: Requirements 2.3**
  describe('Property 3: Player delete removes from list', () => {
    it('deleting a player should remove it from the list and decrease count by exactly one', async () => {
      await fc.assert(
        fc.asyncProperty(
          leagueNameArb,
          fc.array(playerNameArb, { minLength: 1, maxLength: 3 }),
          async (leagueName, playerNames) => {
            resetState();
            const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
            expect(leagueRes.status).toBe(201);
            const leagueId = leagueRes.body.id;

            const addedPlayers = [];
            for (const name of playerNames) {
              const addRes = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name });
              expect(addRes.status).toBe(201);
              addedPlayers.push(addRes.body);
            }

            const beforeRes = await request(server).get(`/api/leagues/${leagueId}/players`);
            expect(beforeRes.status).toBe(200);
            const countBefore = beforeRes.body.length;

            const playerToDelete = addedPlayers[0];
            const deleteRes = await request(server).delete(`/api/players/${playerToDelete.id}`);
            expect(deleteRes.status).toBe(200);

            const afterRes = await request(server).get(`/api/leagues/${leagueId}/players`);
            expect(afterRes.status).toBe(200);
            const found = afterRes.body.find((p: any) => p.id === playerToDelete.id);
            expect(found).toBeUndefined();
            expect(afterRes.body.length).toBe(countBefore - 1);
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);
  });

  // Feature: e2e-integration-tests, Property 4: Court add-then-list round trip
  // **Validates: Requirements 3.1, 3.2**
  describe('Property 4: Court add-then-list round trip', () => {
    it('adding a court to a league and listing courts should include that court with correct fields', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, courtIdentifierArb, async (leagueName, courtIdentifier) => {
          resetState();
          const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
          expect(leagueRes.status).toBe(201);
          const leagueId = leagueRes.body.id;

          const addRes = await request(server).post(`/api/leagues/${leagueId}/courts`).send({ identifier: courtIdentifier });
          expect(addRes.status).toBe(201);
          expect(addRes.body.id).toBeDefined();
          expect(addRes.body.leagueId).toBe(leagueId);
          expect(addRes.body.identifier).toBe(courtIdentifier);
          expect(addRes.body.createdAt).toBeDefined();

          const listRes = await request(server).get(`/api/leagues/${leagueId}/courts`);
          expect(listRes.status).toBe(200);
          expect(Array.isArray(listRes.body)).toBe(true);
          const found = listRes.body.find((c: any) => c.id === addRes.body.id);
          expect(found).toBeDefined();
          expect(found.identifier).toBe(courtIdentifier);
          expect(found.leagueId).toBe(leagueId);
        }),
        { numRuns: 100 }
      );
    }, 60000);
  });

  // Feature: e2e-integration-tests, Property 5: Court delete removes from list
  // **Validates: Requirements 3.3**
  describe('Property 5: Court delete removes from list', () => {
    it('deleting a court should remove it from the list and decrease count by exactly one', async () => {
      await fc.assert(
        fc.asyncProperty(
          leagueNameArb,
          fc.array(courtIdentifierArb, { minLength: 1, maxLength: 3 }),
          async (leagueName, courtIdentifiers) => {
            resetState();
            const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
            expect(leagueRes.status).toBe(201);
            const leagueId = leagueRes.body.id;

            const addedCourts = [];
            for (const identifier of courtIdentifiers) {
              const addRes = await request(server).post(`/api/leagues/${leagueId}/courts`).send({ identifier });
              expect(addRes.status).toBe(201);
              addedCourts.push(addRes.body);
            }

            const beforeRes = await request(server).get(`/api/leagues/${leagueId}/courts`);
            expect(beforeRes.status).toBe(200);
            const countBefore = beforeRes.body.length;

            const courtToDelete = addedCourts[0];
            const deleteRes = await request(server).delete(`/api/courts/${courtToDelete.id}`);
            expect(deleteRes.status).toBe(200);

            const afterRes = await request(server).get(`/api/leagues/${leagueId}/courts`);
            expect(afterRes.status).toBe(200);
            const found = afterRes.body.find((c: any) => c.id === courtToDelete.id);
            expect(found).toBeUndefined();
            expect(afterRes.body.length).toBe(countBefore - 1);
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);
  });

  // Feature: e2e-integration-tests, Property 6: Round generation produces valid incrementing rounds
  // **Validates: Requirements 4.1, 4.2, 4.10**
  describe('Property 6: Round generation produces valid incrementing rounds', () => {
    it('generating N rounds should produce rounds with roundNumber 1 through N, listed in ascending order', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, fc.integer({ min: 1, max: 5 }), async (leagueName, n) => {
          resetState();
          const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
          expect(leagueRes.status).toBe(201);
          const leagueId = leagueRes.body.id;

          for (const name of ['PlayerA', 'PlayerB', 'PlayerC', 'PlayerD']) {
            const r = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name });
            expect(r.status).toBe(201);
          }
          const courtRes = await request(server).post(`/api/leagues/${leagueId}/courts`).send({ identifier: 'Court1' });
          expect(courtRes.status).toBe(201);

          const generatedRounds = [];
          for (let i = 0; i < n; i++) {
            const roundRes = await request(server).post(`/api/leagues/${leagueId}/rounds`);
            expect(roundRes.status).toBe(201);
            generatedRounds.push(roundRes.body);
          }

          for (let i = 0; i < n; i++) {
            expect(generatedRounds[i].roundNumber).toBe(i + 1);
          }

          const listRes = await request(server).get(`/api/leagues/${leagueId}/rounds`);
          expect(listRes.status).toBe(200);
          expect(listRes.body.length).toBe(n);
          for (let i = 0; i < n; i++) {
            expect(listRes.body[i].roundNumber).toBe(i + 1);
          }
          for (let i = 1; i < listRes.body.length; i++) {
            expect(listRes.body[i].roundNumber).toBeGreaterThan(listRes.body[i - 1].roundNumber);
          }
        }),
        { numRuns: 100 }
      );
    }, 60000);
  });

  // Feature: e2e-integration-tests, Property 7: Round retrieval by number round trip
  // **Validates: Requirements 4.3**
  describe('Property 7: Round retrieval by number round trip', () => {
    it('retrieving a generated round by roundNumber should return the same id, leagueId, and roundNumber', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, fc.integer({ min: 1, max: 5 }), async (leagueName, n) => {
          resetState();
          const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
          expect(leagueRes.status).toBe(201);
          const leagueId = leagueRes.body.id;

          for (const name of ['PlayerA', 'PlayerB', 'PlayerC', 'PlayerD']) {
            const r = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name });
            expect(r.status).toBe(201);
          }
          await request(server).post(`/api/leagues/${leagueId}/courts`).send({ identifier: 'Court1' });

          const generatedRounds = [];
          for (let i = 0; i < n; i++) {
            const roundRes = await request(server).post(`/api/leagues/${leagueId}/rounds`);
            expect(roundRes.status).toBe(201);
            generatedRounds.push(roundRes.body);
          }

          for (const round of generatedRounds) {
            const getRes = await request(server).get(`/api/leagues/${leagueId}/rounds/${round.roundNumber}`);
            expect(getRes.status).toBe(200);
            expect(getRes.body.id).toBe(round.id);
            expect(getRes.body.leagueId).toBe(round.leagueId);
            expect(getRes.body.roundNumber).toBe(round.roundNumber);
          }
        }),
        { numRuns: 100 }
      );
    }, 60000);
  });

  // Feature: e2e-integration-tests, Property 8: Current round is the latest generated
  // **Validates: Requirements 4.5**
  describe('Property 8: Current round is the latest generated', () => {
    it('the current round endpoint should return the round with the highest roundNumber', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, fc.integer({ min: 1, max: 5 }), async (leagueName, n) => {
          resetState();
          const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
          expect(leagueRes.status).toBe(201);
          const leagueId = leagueRes.body.id;

          for (const name of ['PlayerA', 'PlayerB', 'PlayerC', 'PlayerD']) {
            const r = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name });
            expect(r.status).toBe(201);
          }
          await request(server).post(`/api/leagues/${leagueId}/courts`).send({ identifier: 'Court1' });

          let lastRound: any;
          for (let i = 0; i < n; i++) {
            const roundRes = await request(server).post(`/api/leagues/${leagueId}/rounds`);
            expect(roundRes.status).toBe(201);
            lastRound = roundRes.body;
          }

          const currentRes = await request(server).get(`/api/leagues/${leagueId}/rounds/current`);
          expect(currentRes.status).toBe(200);
          expect(currentRes.body.roundNumber).toBe(n);
          expect(currentRes.body.id).toBe(lastRound.id);
        }),
        { numRuns: 100 }
      );
    }, 60000);
  });

  // Feature: e2e-integration-tests, Property 9: Clear rounds empties the round list
  // **Validates: Requirements 4.9**
  describe('Property 9: Clear rounds empties the round list', () => {
    it('clearing rounds should result in an empty round list', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, fc.integer({ min: 1, max: 5 }), async (leagueName, n) => {
          resetState();
          const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
          expect(leagueRes.status).toBe(201);
          const leagueId = leagueRes.body.id;

          for (const name of ['PlayerA', 'PlayerB', 'PlayerC', 'PlayerD']) {
            const r = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name });
            expect(r.status).toBe(201);
          }
          await request(server).post(`/api/leagues/${leagueId}/courts`).send({ identifier: 'Court1' });

          for (let i = 0; i < n; i++) {
            const roundRes = await request(server).post(`/api/leagues/${leagueId}/rounds`);
            expect(roundRes.status).toBe(201);
          }

          const deleteRes = await request(server).delete(`/api/leagues/${leagueId}/rounds`);
          expect(deleteRes.status).toBe(204);

          const afterRes = await request(server).get(`/api/leagues/${leagueId}/rounds`);
          expect(afterRes.status).toBe(200);
          expect(afterRes.body).toEqual([]);
        }),
        { numRuns: 100 }
      );
    }, 120000);
  });

  // Feature: e2e-integration-tests, Property 10: Generated assignments are structurally valid
  // **Validates: Requirements 5.1, 5.2**
  describe('Property 10: Generated assignments are structurally valid', () => {
    it('each assignment should have a valid courtId and two teams of exactly 2 player IDs referencing league players', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, async (leagueName) => {
          resetState();
          const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
          expect(leagueRes.status).toBe(201);
          const leagueId = leagueRes.body.id;

          const playerNames = ['P1', 'P2', 'P3', 'P4'];
          const players: any[] = [];
          for (const name of playerNames) {
            const r = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name });
            expect(r.status).toBe(201);
            players.push(r.body);
          }
          const playerIds = new Set(players.map((p: any) => p.id));

          const courtRes = await request(server).post(`/api/leagues/${leagueId}/courts`).send({ identifier: 'Court1' });
          expect(courtRes.status).toBe(201);
          const courtId = courtRes.body.id;

          const roundRes = await request(server).post(`/api/leagues/${leagueId}/rounds`);
          expect(roundRes.status).toBe(201);
          const roundId = roundRes.body.id;

          const assignRes = await request(server).get(`/api/rounds/${roundId}/assignments`);
          expect(assignRes.status).toBe(200);
          expect(Array.isArray(assignRes.body)).toBe(true);
          expect(assignRes.body.length).toBeGreaterThan(0);

          for (const assignment of assignRes.body) {
            expect(assignment.courtId).toBe(courtId);
            expect(Array.isArray(assignment.team1PlayerIds)).toBe(true);
            expect(Array.isArray(assignment.team2PlayerIds)).toBe(true);
            expect(assignment.team1PlayerIds.length).toBe(2);
            expect(assignment.team2PlayerIds.length).toBe(2);
            for (const pid of [...assignment.team1PlayerIds, ...assignment.team2PlayerIds]) {
              expect(playerIds.has(pid)).toBe(true);
            }
          }
        }),
        { numRuns: 100 }
      );
    }, 60000);
  });

  // Feature: e2e-integration-tests, Property 11: Bye counts reflect unassigned players
  // **Validates: Requirements 5.3**
  describe('Property 11: Bye counts reflect unassigned players', () => {
    it('total byes per round should equal (playerCount - courts * 4) when players exceed capacity', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, async (leagueName) => {
          resetState();
          const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
          expect(leagueRes.status).toBe(201);
          const leagueId = leagueRes.body.id;

          const playerNames = ['P1', 'P2', 'P3', 'P4', 'P5'];
          for (const name of playerNames) {
            const r = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name });
            expect(r.status).toBe(201);
          }
          await request(server).post(`/api/leagues/${leagueId}/courts`).send({ identifier: 'Court1' });

          const roundRes = await request(server).post(`/api/leagues/${leagueId}/rounds`);
          expect(roundRes.status).toBe(201);
          const roundId = roundRes.body.id;

          const assignRes = await request(server).get(`/api/rounds/${roundId}/assignments`);
          expect(assignRes.status).toBe(200);

          const assignedPlayerIds = new Set<string>();
          for (const a of assignRes.body) {
            for (const pid of [...a.team1PlayerIds, ...a.team2PlayerIds]) {
              assignedPlayerIds.add(pid);
            }
          }

          const byeCount = playerNames.length - assignedPlayerIds.size;
          const expectedByes = playerNames.length - 1 * 4;
          expect(byeCount).toBe(expectedByes);

          const byeRes = await request(server).get(`/api/leagues/${leagueId}/bye-counts`);
          expect(byeRes.status).toBe(200);
          const totalByes = Object.values(byeRes.body as Record<string, number>).reduce((sum: number, c: number) => sum + c, 0);
          expect(totalByes).toBe(expectedByes);
        }),
        { numRuns: 100 }
      );
    }, 60000);
  });

  // Feature: e2e-integration-tests, Property 12: Assignment update round trip
  // **Validates: Requirements 5.4**
  describe('Property 12: Assignment update round trip', () => {
    it('updating assignments with swapped players should be reflected when retrieved', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, async (leagueName) => {
          resetState();
          const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
          expect(leagueRes.status).toBe(201);
          const leagueId = leagueRes.body.id;

          const playerNames = ['P1', 'P2', 'P3', 'P4'];
          for (const name of playerNames) {
            const r = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name });
            expect(r.status).toBe(201);
          }
          await request(server).post(`/api/leagues/${leagueId}/courts`).send({ identifier: 'Court1' });

          const roundRes = await request(server).post(`/api/leagues/${leagueId}/rounds`);
          expect(roundRes.status).toBe(201);
          const roundId = roundRes.body.id;

          const origRes = await request(server).get(`/api/rounds/${roundId}/assignments`);
          expect(origRes.status).toBe(200);
          expect(origRes.body.length).toBeGreaterThan(0);

          const orig = origRes.body[0];
          const newTeam1 = [orig.team1PlayerIds[0], orig.team2PlayerIds[0]];
          const newTeam2 = [orig.team1PlayerIds[1], orig.team2PlayerIds[1]];

          const putRes = await request(server).put(`/api/rounds/${roundId}/assignments`).send({
            assignments: [{ courtId: orig.courtId, team1PlayerIds: newTeam1, team2PlayerIds: newTeam2 }]
          });
          expect(putRes.status).toBe(200);

          const afterRes = await request(server).get(`/api/rounds/${roundId}/assignments`);
          expect(afterRes.status).toBe(200);
          const updated = afterRes.body.find((a: any) => a.courtId === orig.courtId);
          expect(updated).toBeDefined();
          expect(updated.team1PlayerIds.sort()).toEqual(newTeam1.sort());
          expect(updated.team2PlayerIds.sort()).toEqual(newTeam2.sort());
        }),
        { numRuns: 100 }
      );
    }, 60000);
  });

  // Feature: e2e-integration-tests, Property 13: Bye distribution fairness across rounds
  // **Validates: Requirements 5.6**
  describe('Property 13: Bye distribution fairness across rounds', () => {
    it('max bye count minus min bye count across all players should be at most 1', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, fc.integer({ min: 3, max: 5 }), async (leagueName, numRounds) => {
          resetState();
          const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
          expect(leagueRes.status).toBe(201);
          const leagueId = leagueRes.body.id;

          const playerNames = ['P1', 'P2', 'P3', 'P4', 'P5'];
          for (const name of playerNames) {
            const r = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name });
            expect(r.status).toBe(201);
          }
          await request(server).post(`/api/leagues/${leagueId}/courts`).send({ identifier: 'Court1' });

          for (let i = 0; i < numRounds; i++) {
            const roundRes = await request(server).post(`/api/leagues/${leagueId}/rounds`);
            expect(roundRes.status).toBe(201);
          }

          const byeRes = await request(server).get(`/api/leagues/${leagueId}/bye-counts`);
          expect(byeRes.status).toBe(200);
          const counts = Object.values(byeRes.body as Record<string, number>);
          expect(counts.length).toBeGreaterThan(0);
          const maxBye = Math.max(...counts);
          const minBye = Math.min(...counts);
          expect(maxBye - minBye).toBeLessThanOrEqual(1);
        }),
        { numRuns: 50 }
      );
    }, 120000);
  });

  // Feature: e2e-integration-tests, Property 14: No consecutive byes for any player
  // **Validates: Requirements 5.7**
  describe('Property 14: No consecutive byes for any player', () => {
    it('no player should be on bye in two consecutive rounds', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, fc.integer({ min: 3, max: 5 }), async (leagueName, numRounds) => {
          resetState();
          const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
          expect(leagueRes.status).toBe(201);
          const leagueId = leagueRes.body.id;

          const playerNames = ['P1', 'P2', 'P3', 'P4', 'P5'];
          const players: any[] = [];
          for (const name of playerNames) {
            const r = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name });
            expect(r.status).toBe(201);
            players.push(r.body);
          }
          const playerIds = players.map((p: any) => p.id);
          await request(server).post(`/api/leagues/${leagueId}/courts`).send({ identifier: 'Court1' });

          const roundIds: string[] = [];
          for (let i = 0; i < numRounds; i++) {
            const roundRes = await request(server).post(`/api/leagues/${leagueId}/rounds`);
            expect(roundRes.status).toBe(201);
            roundIds.push(roundRes.body.id);
          }

          const byesByRound: Set<string>[] = [];
          for (const roundId of roundIds) {
            const assignRes = await request(server).get(`/api/rounds/${roundId}/assignments`);
            expect(assignRes.status).toBe(200);
            const assignedInRound = new Set<string>();
            for (const a of assignRes.body) {
              for (const pid of [...a.team1PlayerIds, ...a.team2PlayerIds]) {
                assignedInRound.add(pid);
              }
            }
            const onBye = new Set<string>();
            for (const pid of playerIds) {
              if (!assignedInRound.has(pid)) onBye.add(pid);
            }
            byesByRound.push(onBye);
          }

          for (let i = 1; i < byesByRound.length; i++) {
            for (const pid of byesByRound[i]) {
              expect(byesByRound[i - 1].has(pid)).toBe(false);
            }
          }
        }),
        { numRuns: 50 }
      );
    }, 120000);
  });

  // Feature: e2e-integration-tests, Property 15: Bye count accuracy tracks per-round increments
  // **Validates: Requirements 5.8**
  describe('Property 15: Bye count accuracy tracks per-round increments', () => {
    it('bye count should increment by exactly 1 for players on bye and remain unchanged for assigned players', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, fc.integer({ min: 2, max: 4 }), async (leagueName, numRounds) => {
          resetState();
          const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
          expect(leagueRes.status).toBe(201);
          const leagueId = leagueRes.body.id;

          const playerNames = ['P1', 'P2', 'P3', 'P4', 'P5'];
          const players: any[] = [];
          for (const name of playerNames) {
            const r = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name });
            expect(r.status).toBe(201);
            players.push(r.body);
          }
          const playerIds = players.map((p: any) => p.id);
          await request(server).post(`/api/leagues/${leagueId}/courts`).send({ identifier: 'Court1' });

          let prevByeCounts: Record<string, number> = {};
          for (const pid of playerIds) { prevByeCounts[pid] = 0; }

          for (let i = 0; i < numRounds; i++) {
            const roundRes = await request(server).post(`/api/leagues/${leagueId}/rounds`);
            expect(roundRes.status).toBe(201);
            const roundId = roundRes.body.id;

            const assignRes = await request(server).get(`/api/rounds/${roundId}/assignments`);
            expect(assignRes.status).toBe(200);
            const assignedInRound = new Set<string>();
            for (const a of assignRes.body) {
              for (const pid of [...a.team1PlayerIds, ...a.team2PlayerIds]) {
                assignedInRound.add(pid);
              }
            }

            const byeRes = await request(server).get(`/api/leagues/${leagueId}/bye-counts`);
            expect(byeRes.status).toBe(200);
            for (const pid of playerIds) {
              const currentCount = byeRes.body[pid] ?? 0;
              if (assignedInRound.has(pid)) {
                expect(currentCount).toBe(prevByeCounts[pid]);
              } else {
                expect(currentCount).toBe(prevByeCounts[pid] + 1);
              }
            }
            prevByeCounts = { ...byeRes.body };
          }

          const finalByeRes = await request(server).get(`/api/leagues/${leagueId}/bye-counts`);
          expect(finalByeRes.status).toBe(200);
          const totalByes = Object.values(finalByeRes.body as Record<string, number>).reduce((sum: number, c: number) => sum + c, 0);
          expect(totalByes).toBe(numRounds);
        }),
        { numRuns: 50 }
      );
    }, 120000);
  });

  // Feature: e2e-integration-tests, Property 16: Round regeneration preserves past and recreates future
  // **Validates: Requirements 6.1, 6.5**
  describe('Property 16: Round regeneration preserves past and recreates future', () => {
    it('regenerating after round K should preserve rounds 1..K and produce new rounds for K+1..N, total count remains N', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, fc.integer({ min: 2, max: 5 }), async (leagueName, totalRounds) => {
          resetState();
          const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
          expect(leagueRes.status).toBe(201);
          const leagueId = leagueRes.body.id;

          for (const name of ['PlayerA', 'PlayerB', 'PlayerC', 'PlayerD']) {
            const r = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name });
            expect(r.status).toBe(201);
          }
          await request(server).post(`/api/leagues/${leagueId}/courts`).send({ identifier: 'Court1' });

          for (let i = 0; i < totalRounds; i++) {
            const roundRes = await request(server).post(`/api/leagues/${leagueId}/rounds`);
            expect(roundRes.status).toBe(201);
          }

          const beforeRes = await request(server).get(`/api/leagues/${leagueId}/rounds`);
          expect(beforeRes.status).toBe(200);
          expect(beforeRes.body.length).toBe(totalRounds);

          const K = Math.floor(Math.random() * (totalRounds - 1)) + 1;
          const originalPreserved = beforeRes.body
            .filter((r: any) => r.roundNumber <= K)
            .map((r: any) => ({ id: r.id, roundNumber: r.roundNumber }));

          const regenRes = await request(server).post(`/api/leagues/${leagueId}/rounds/regenerate`).send({ afterRoundNumber: K });
          expect(regenRes.status).toBe(200);

          const afterRes = await request(server).get(`/api/leagues/${leagueId}/rounds`);
          expect(afterRes.status).toBe(200);
          expect(afterRes.body.length).toBe(totalRounds);

          for (const orig of originalPreserved) {
            const found = afterRes.body.find((r: any) => r.roundNumber === orig.roundNumber);
            expect(found).toBeDefined();
            expect(found.id).toBe(orig.id);
          }
          for (let rn = K + 1; rn <= totalRounds; rn++) {
            const found = afterRes.body.find((r: any) => r.roundNumber === rn);
            expect(found).toBeDefined();
          }
        }),
        { numRuns: 50 }
      );
    }, 120000);
  });

  // Feature: e2e-integration-tests, Property 17: Regeneration reflects roster changes
  // **Validates: Requirements 6.2, 6.3**
  describe('Property 17: Regeneration reflects roster changes', () => {
    it('adding a new player and regenerating should include them; removing a player and regenerating should exclude them', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, playerNameArb, async (leagueName, newPlayerName) => {
          resetState();
          const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
          expect(leagueRes.status).toBe(201);
          const leagueId = leagueRes.body.id;

          const basePlayerNames = ['P1', 'P2', 'P3', 'P4', 'P5'];
          for (const name of basePlayerNames) {
            const r = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name });
            expect(r.status).toBe(201);
          }
          await request(server).post(`/api/leagues/${leagueId}/courts`).send({ identifier: 'Court1' });

          for (let i = 0; i < 3; i++) {
            const roundRes = await request(server).post(`/api/leagues/${leagueId}/rounds`);
            expect(roundRes.status).toBe(201);
          }

          // Part A: Add a new player and regenerate
          const addRes = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name: newPlayerName });
          expect(addRes.status).toBe(201);
          const newPlayerId = addRes.body.id;

          const regenAddRes = await request(server).post(`/api/leagues/${leagueId}/rounds/regenerate`).send({ afterRoundNumber: 1 });
          expect(regenAddRes.status).toBe(200);

          let newPlayerFound = false;
          const regeneratedRoundsAdd = regenAddRes.body.filter((r: any) => r.roundNumber > 1);
          for (const round of regeneratedRoundsAdd) {
            const assignRes = await request(server).get(`/api/rounds/${round.id}/assignments`);
            expect(assignRes.status).toBe(200);
            const allIds = assignRes.body.flatMap((a: any) => [...a.team1PlayerIds, ...a.team2PlayerIds]);
            if (allIds.includes(newPlayerId)) { newPlayerFound = true; break; }
          }
          expect(newPlayerFound).toBe(true);

          // Part B: Remove the player and regenerate
          const deleteRes = await request(server).delete(`/api/players/${newPlayerId}`);
          expect(deleteRes.status).toBe(200);

          const regenRemoveRes = await request(server).post(`/api/leagues/${leagueId}/rounds/regenerate`).send({ afterRoundNumber: 1 });
          expect(regenRemoveRes.status).toBe(200);

          const regeneratedRoundsRemove = regenRemoveRes.body.filter((r: any) => r.roundNumber > 1);
          for (const round of regeneratedRoundsRemove) {
            const assignRes = await request(server).get(`/api/rounds/${round.id}/assignments`);
            expect(assignRes.status).toBe(200);
            const allIds = assignRes.body.flatMap((a: any) => [...a.team1PlayerIds, ...a.team2PlayerIds]);
            expect(allIds).not.toContain(newPlayerId);
          }
        }),
        { numRuns: 50 }
      );
    }, 120000);
  });

  // Feature: e2e-integration-tests, Property 18: Player uniqueness per round assignment
  // **Validates: Requirements 7.2**
  describe('Property 18: Player uniqueness per round assignment', () => {
    it('each player ID should appear in at most one assignment per round', async () => {
      await fc.assert(
        fc.asyncProperty(
          leagueNameArb,
          fc.integer({ min: 4, max: 8 }),
          fc.integer({ min: 1, max: 2 }),
          async (leagueName, numPlayers, numCourts) => {
            resetState();
            const leagueRes = await request(server).post('/api/leagues').send({ name: leagueName, format: 'round_robin' });
            expect(leagueRes.status).toBe(201);
            const leagueId = leagueRes.body.id;

            for (let i = 0; i < numPlayers; i++) {
              const r = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name: `Player${i + 1}` });
              expect(r.status).toBe(201);
            }
            for (let i = 0; i < numCourts; i++) {
              const r = await request(server).post(`/api/leagues/${leagueId}/courts`).send({ identifier: `Court${i + 1}` });
              expect(r.status).toBe(201);
            }

            const roundRes = await request(server).post(`/api/leagues/${leagueId}/rounds`);
            expect(roundRes.status).toBe(201);
            const roundId = roundRes.body.id;

            const assignRes = await request(server).get(`/api/rounds/${roundId}/assignments`);
            expect(assignRes.status).toBe(200);

            const allPlayerIds: string[] = [];
            for (const assignment of assignRes.body) {
              for (const pid of [...assignment.team1PlayerIds, ...assignment.team2PlayerIds]) {
                allPlayerIds.push(pid);
              }
            }
            const uniquePlayerIds = new Set(allPlayerIds);
            expect(uniquePlayerIds.size).toBe(allPlayerIds.length);
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);
  });

  // Feature: e2e-integration-tests, Property 19: Data isolation across leagues
  // **Validates: Requirements 11.1, 11.2, 12.1, 12.2, 12.3, 12.4**
  describe('Property 19: Data isolation across leagues', () => {
    it('two leagues should only see their own entities; deleting from one should not affect the other', async () => {
      await fc.assert(
        fc.asyncProperty(
          leagueNameArb, leagueNameArb,
          fc.array(playerNameArb, { minLength: 4, maxLength: 6 }),
          fc.array(playerNameArb, { minLength: 4, maxLength: 6 }),
          fc.array(courtIdentifierArb, { minLength: 1, maxLength: 2 }),
          fc.array(courtIdentifierArb, { minLength: 1, maxLength: 2 }),
          async (nameA, nameB, playersA, playersB, courtsA, courtsB) => {
            resetState();
            const leagueARes = await request(server).post('/api/leagues').send({ name: nameA, format: 'round_robin' });
            expect(leagueARes.status).toBe(201);
            const leagueAId = leagueARes.body.id;

            const leagueBRes = await request(server).post('/api/leagues').send({ name: nameB, format: 'round_robin' });
            expect(leagueBRes.status).toBe(201);
            const leagueBId = leagueBRes.body.id;

            const addedPlayersA: any[] = [];
            for (const pName of playersA) {
              const r = await request(server).post(`/api/leagues/${leagueAId}/players`).send({ name: pName });
              expect(r.status).toBe(201);
              addedPlayersA.push(r.body);
            }
            for (const pName of playersB) {
              const r = await request(server).post(`/api/leagues/${leagueBId}/players`).send({ name: pName });
              expect(r.status).toBe(201);
            }
            for (const cId of courtsA) {
              await request(server).post(`/api/leagues/${leagueAId}/courts`).send({ identifier: cId });
            }
            for (const cId of courtsB) {
              await request(server).post(`/api/leagues/${leagueBId}/courts`).send({ identifier: cId });
            }

            await request(server).post(`/api/leagues/${leagueAId}/rounds`);
            await request(server).post(`/api/leagues/${leagueBId}/rounds`);

            // Verify player isolation
            const listPlayersA = await request(server).get(`/api/leagues/${leagueAId}/players`);
            expect(listPlayersA.status).toBe(200);
            expect(listPlayersA.body.length).toBe(playersA.length);
            for (const p of listPlayersA.body) { expect(p.leagueId).toBe(leagueAId); }

            const listPlayersB = await request(server).get(`/api/leagues/${leagueBId}/players`);
            expect(listPlayersB.status).toBe(200);
            expect(listPlayersB.body.length).toBe(playersB.length);
            for (const p of listPlayersB.body) { expect(p.leagueId).toBe(leagueBId); }

            // Verify court isolation
            const listCourtsA = await request(server).get(`/api/leagues/${leagueAId}/courts`);
            expect(listCourtsA.body.length).toBe(courtsA.length);
            const listCourtsB = await request(server).get(`/api/leagues/${leagueBId}/courts`);
            expect(listCourtsB.body.length).toBe(courtsB.length);

            // Verify round isolation
            const listRoundsA = await request(server).get(`/api/leagues/${leagueAId}/rounds`);
            expect(listRoundsA.body.length).toBe(1);
            expect(listRoundsA.body[0].leagueId).toBe(leagueAId);
            const listRoundsB = await request(server).get(`/api/leagues/${leagueBId}/rounds`);
            expect(listRoundsB.body.length).toBe(1);
            expect(listRoundsB.body[0].leagueId).toBe(leagueBId);

            // Delete from A, verify B unaffected
            const playerToDelete = addedPlayersA[0];
            await request(server).delete(`/api/players/${playerToDelete.id}`);
            const afterDeleteA = await request(server).get(`/api/leagues/${leagueAId}/players`);
            expect(afterDeleteA.body.length).toBe(playersA.length - 1);
            const afterDeleteB = await request(server).get(`/api/leagues/${leagueBId}/players`);
            expect(afterDeleteB.body.length).toBe(playersB.length);
          }
        ),
        { numRuns: 100 }
      );
    }, 120000);
  });

  // Feature: e2e-integration-tests, Property 20: Error response structure consistency
  // **Validates: Requirements 11.1, 11.2, 12.1, 12.2**
  describe('Property 20: Error response structure consistency', () => {
    it('validation errors (400) should have error.code = VALIDATION_ERROR and a non-empty error.message', async () => {
      await fc.assert(
        fc.asyncProperty(leagueNameArb, async (randomName) => {
          resetState();
          const emptyBodyRes = await request(server).post('/api/leagues').send({});
          expect(emptyBodyRes.status).toBe(400);
          expect(emptyBodyRes.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
          expect(typeof emptyBodyRes.body.error.message).toBe('string');
          expect(emptyBodyRes.body.error.message.length).toBeGreaterThan(0);

          const invalidFormatRes = await request(server).post('/api/leagues').send({ name: randomName, format: 'invalid_format' });
          expect(invalidFormatRes.status).toBe(400);
          expect(invalidFormatRes.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

          const leagueRes = await request(server).post('/api/leagues').send({ name: randomName, format: 'round_robin' });
          expect(leagueRes.status).toBe(201);
          const leagueId = leagueRes.body.id;

          const emptyPlayerRes = await request(server).post(`/api/leagues/${leagueId}/players`).send({ name: '' });
          expect(emptyPlayerRes.status).toBe(400);
          expect(emptyPlayerRes.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

          const missingCourtRes = await request(server).post(`/api/leagues/${leagueId}/courts`).send({});
          expect(missingCourtRes.status).toBe(400);
          expect(missingCourtRes.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        }),
        { numRuns: 100 }
      );
    }, 60000);

    it('not-found errors (404) should have error.code = NOT_FOUND and a non-empty error.message', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (randomId) => {
          resetState();
          const leagueNotFoundRes = await request(server).get(`/api/leagues/${randomId}`);
          expect(leagueNotFoundRes.status).toBe(404);
          expect(leagueNotFoundRes.body.error).toHaveProperty('code', 'NOT_FOUND');
          expect(typeof leagueNotFoundRes.body.error.message).toBe('string');
          expect(leagueNotFoundRes.body.error.message.length).toBeGreaterThan(0);

          const playerNotFoundRes = await request(server).delete(`/api/players/${randomId}`);
          expect(playerNotFoundRes.status).toBe(404);
          expect(playerNotFoundRes.body.error).toHaveProperty('code', 'NOT_FOUND');

          const courtNotFoundRes = await request(server).delete(`/api/courts/${randomId}`);
          expect(courtNotFoundRes.status).toBe(404);
          expect(courtNotFoundRes.body.error).toHaveProperty('code', 'NOT_FOUND');
        }),
        { numRuns: 100 }
      );
    }, 60000);
  });
});

// Feature: partner-uniqueness-optimization, Property 1: Canonical Key Symmetry
// For any two player IDs a and b, getPartnerKey(a, b) === getPartnerKey(b, a)
// **Validates: Requirement 1.2**
describe('Partner Uniqueness - Property 1: Canonical Key Symmetry', () => {
  const { AssignmentService } = require('../../services/AssignmentService');
  const service = new AssignmentService();

  // Arbitrary: non-empty alphanumeric player IDs
  const playerIdArb = fc.stringMatching(/^[a-zA-Z0-9]{1,30}$/);

  it('getPartnerKey(a, b) === getPartnerKey(b, a) for any two player IDs', () => {
    fc.assert(
      fc.property(playerIdArb, playerIdArb, (a, b) => {
        expect(service.getPartnerKey(a, b)).toBe(service.getPartnerKey(b, a));
      }),
      { numRuns: 1000 }
    );
  });

  it('getPartnerKey always produces a key with underscore separator and sorted IDs', () => {
    fc.assert(
      fc.property(playerIdArb, playerIdArb, (a, b) => {
        const key = service.getPartnerKey(a, b);
        const parts = key.split('_');
        expect(parts.length).toBe(2);
        // First part should be lexicographically <= second part
        expect(parts[0] <= parts[1]).toBe(true);
      }),
      { numRuns: 1000 }
    );
  });
});


// Feature: partner-uniqueness-optimization, Property 2: Partnership History Correctness
// For any set of assignments, the map contains correct counts for all within-team pairs
// Total entries equals sum of C(S,2) across all teams
// **Validates: Requirements 1.1, 1.3**
describe('Partner Uniqueness - Property 2: Partnership History Correctness', () => {
  const { AssignmentService } = require('../../services/AssignmentService');
  const service = new AssignmentService();

  // Arbitrary: non-empty alphanumeric player IDs
  const playerIdArb = fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/);

  // Arbitrary: a team of 1-4 unique player IDs
  const teamArb = fc.uniqueArray(playerIdArb, { minLength: 1, maxLength: 4 });

  // Arbitrary: a single assignment with two teams
  const assignmentArb = fc.tuple(teamArb, teamArb).map(([team1, team2]) => ({
    id: 'a-id',
    roundId: 'r-id',
    courtId: 'c-id',
    team1PlayerIds: team1,
    team2PlayerIds: team2,
    createdAt: new Date(),
  }));

  // Arbitrary: a list of 0-5 assignments
  const assignmentsArb = fc.array(assignmentArb, { minLength: 0, maxLength: 5 });

  // Helper: C(n,2) = n*(n-1)/2
  const choose2 = (n: number) => (n * (n - 1)) / 2;

  it('map contains correct counts for all within-team pairs and total entries equals sum of C(S,2)', () => {
    fc.assert(
      fc.property(assignmentsArb, (assignments) => {
        const history = service.buildPartnershipHistory(assignments);

        // Independently compute expected counts
        const expected = new Map<string, number>();
        for (const assignment of assignments) {
          for (const team of [assignment.team1PlayerIds, assignment.team2PlayerIds]) {
            for (let i = 0; i < team.length; i++) {
              for (let j = i + 1; j < team.length; j++) {
                const key = service.getPartnerKey(team[i], team[j]);
                expected.set(key, (expected.get(key) ?? 0) + 1);
              }
            }
          }
        }

        // Every expected pair should be in the history with the correct count
        for (const [key, count] of expected) {
          expect(history.get(key)).toBe(count);
        }

        // History should not contain any extra entries
        expect(history.size).toBe(expected.size);

        // Total entries equals sum of C(S,2) across all teams (counting unique keys)
        // Verify via an alternative calculation: sum of C(S,2) across all teams
        // equals the total number of pair increments, which equals sum of all values
        let totalPairIncrements = 0;
        for (const assignment of assignments) {
          for (const team of [assignment.team1PlayerIds, assignment.team2PlayerIds]) {
            totalPairIncrements += choose2(team.length);
          }
        }
        const totalHistoryValues = (Array.from(history.values()) as number[]).reduce((s, v) => s + v, 0);
        expect(totalHistoryValues).toBe(totalPairIncrements);
      }),
      { numRuns: 500 }
    );
  });

  it('empty assignments produce an empty map', () => {
    fc.assert(
      fc.property(fc.constant([]), (assignments) => {
        const history = service.buildPartnershipHistory(assignments);
        expect(history.size).toBe(0);
      }),
      { numRuns: 1 }
    );
  });
});



// Feature: partner-uniqueness-optimization, Property 3: Partnership History Non-Negative Invariant
// For any set of assignments (including empty), every value in the map is a non-negative integer
// **Validates: Requirement 1.5**
describe('Partner Uniqueness - Property 3: Partnership History Non-Negative Invariant', () => {
  const { AssignmentService } = require('../../services/AssignmentService');
  const service = new AssignmentService();

  const playerIdArb = fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/);
  const teamArb = fc.uniqueArray(playerIdArb, { minLength: 1, maxLength: 4 });

  const assignmentArb = fc.tuple(teamArb, teamArb).map(([team1, team2]) => ({
    id: 'a-id',
    roundId: 'r-id',
    courtId: 'c-id',
    team1PlayerIds: team1,
    team2PlayerIds: team2,
    createdAt: new Date(),
  }));

  const assignmentsArb = fc.array(assignmentArb, { minLength: 0, maxLength: 10 });

  it('every value in the partnership history map is a non-negative integer', () => {
    fc.assert(
      fc.property(assignmentsArb, (assignments) => {
        const history = service.buildPartnershipHistory(assignments);
        for (const value of history.values()) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(value)).toBe(true);
        }
      }),
      { numRuns: 1000 }
    );
  });

  it('empty assignments produce an empty map (trivially non-negative)', () => {
    const history = service.buildPartnershipHistory([]);
    expect(history.size).toBe(0);
  });

  it('undefined input produces an empty map (trivially non-negative)', () => {
    const history = service.buildPartnershipHistory(undefined);
    expect(history.size).toBe(0);
  });
});

// Feature: partner-uniqueness-optimization, Property 4: Split Optimality
// For any 4 players and any partnership history, the chosen split has score ≤ every other possible split's score
// **Validates: Requirements 2.1, 2.3, 2.4, 2.5, 3.1**
describe('Partner Uniqueness - Property 4: Split Optimality', () => {
  const { AssignmentService } = require('../../services/AssignmentService');
  const service = new AssignmentService();

  const playerIdArb = fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/);

  // Arbitrary: 4 unique player IDs as Player objects
  const fourPlayersArb = fc.uniqueArray(playerIdArb, { minLength: 4, maxLength: 4 }).map(
    ids => ids.map(id => ({ id, name: id, leagueId: 'l', createdAt: new Date() }))
  );

  // Arbitrary: a partnership history map with random counts for random pairs
  const partnershipHistoryArb = fc
    .array(
      fc.tuple(playerIdArb, playerIdArb, fc.integer({ min: 0, max: 20 })),
      { minLength: 0, maxLength: 15 }
    )
    .map(entries => {
      const map = new Map<string, number>();
      for (const [a, b, count] of entries) {
        const key = service.getPartnerKey(a, b);
        map.set(key, (map.get(key) ?? 0) + count);
      }
      return map;
    });

  it('chosen split has score ≤ every other possible split score', () => {
    fc.assert(
      fc.property(fourPlayersArb, partnershipHistoryArb, (players, history) => {
        const [team1, team2] = service.optimizeTeamSplit(players, history);
        const chosenScore = service.scoreSplit(team1, team2, history);

        // Enumerate all 3 possible 2v2 splits
        const ids = players.map((p: any) => p.id);
        const [a, b, c, d] = ids;
        const allSplits: [string[], string[]][] = [
          [[a, b], [c, d]],
          [[a, c], [b, d]],
          [[a, d], [b, c]],
        ];

        for (const [t1, t2] of allSplits) {
          const altScore = service.scoreSplit(t1, t2, history);
          expect(chosenScore).toBeLessThanOrEqual(altScore);
        }
      }),
      { numRuns: 1000 }
    );
  });

  it('chosen split is optimal even when all pairings have high counts (graceful degradation)', () => {
    fc.assert(
      fc.property(fourPlayersArb, (players) => {
        // Build a history where every pair has a high count
        const ids = players.map((p: any) => p.id);
        const history = new Map<string, number>();
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            history.set(service.getPartnerKey(ids[i], ids[j]), 100);
          }
        }

        const [team1, team2] = service.optimizeTeamSplit(players, history);
        const chosenScore = service.scoreSplit(team1, team2, history);

        const [a, b, c, d] = ids;
        const allSplits: [string[], string[]][] = [
          [[a, b], [c, d]],
          [[a, c], [b, d]],
          [[a, d], [b, c]],
        ];

        for (const [t1, t2] of allSplits) {
          expect(chosenScore).toBeLessThanOrEqual(service.scoreSplit(t1, t2, history));
        }
      }),
      { numRuns: 500 }
    );
  });
});



// Feature: partner-uniqueness-optimization, Property 5: Score Function Correctness
// For any candidate split and any partnership history, scoreSplit returns the sum of map values
// for all within-team pairs, defaulting to 0 for missing pairs
// **Validates: Requirement 2.2**
describe('Partner Uniqueness - Property 5: Score Function Correctness', () => {
  const { AssignmentService } = require('../../services/AssignmentService');
  const service = new AssignmentService();

  const playerIdArb = fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/);

  // Arbitrary: two teams of 1-4 unique player IDs each
  const teamArb = fc.uniqueArray(playerIdArb, { minLength: 1, maxLength: 4 });

  // Arbitrary: a partnership history map with random counts for random pairs
  const partnershipHistoryArb = fc
    .array(
      fc.tuple(playerIdArb, playerIdArb, fc.integer({ min: 0, max: 50 })),
      { minLength: 0, maxLength: 20 }
    )
    .map(entries => {
      const map = new Map<string, number>();
      for (const [a, b, count] of entries) {
        const key = service.getPartnerKey(a, b);
        map.set(key, (map.get(key) ?? 0) + count);
      }
      return map;
    });

  it('scoreSplit returns the sum of partnership history counts for all within-team pairs', () => {
    fc.assert(
      fc.property(teamArb, teamArb, partnershipHistoryArb, (team1, team2, history) => {
        const actual = service.scoreSplit(team1, team2, history);

        // Independently compute expected score
        let expected = 0;
        // Sum within-team pairs for team1
        for (let i = 0; i < team1.length; i++) {
          for (let j = i + 1; j < team1.length; j++) {
            const key = service.getPartnerKey(team1[i], team1[j]);
            expected += history.get(key) ?? 0;
          }
        }
        // Sum within-team pairs for team2
        for (let i = 0; i < team2.length; i++) {
          for (let j = i + 1; j < team2.length; j++) {
            const key = service.getPartnerKey(team2[i], team2[j]);
            expected += history.get(key) ?? 0;
          }
        }

        expect(actual).toBe(expected);
      }),
      { numRuns: 1000 }
    );
  });

  it('scoreSplit returns 0 when partnership history is empty', () => {
    fc.assert(
      fc.property(teamArb, teamArb, (team1, team2) => {
        const emptyHistory = new Map<string, number>();
        expect(service.scoreSplit(team1, team2, emptyHistory)).toBe(0);
      }),
      { numRuns: 500 }
    );
  });

  it('scoreSplit returns 0 when teams have single players (no pairs)', () => {
    fc.assert(
      fc.property(playerIdArb, playerIdArb, partnershipHistoryArb, (p1, p2, history) => {
        expect(service.scoreSplit([p1], [p2], history)).toBe(0);
      }),
      { numRuns: 500 }
    );
  });

  it('scoreSplit only considers within-team pairs, not cross-team pairs', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(playerIdArb, { minLength: 4, maxLength: 4 }),
        (ids) => {
          const [a, b, c, d] = ids;
          // Set up history where only cross-team pairs have counts
          const history = new Map<string, number>();
          history.set(service.getPartnerKey(a, c), 10);
          history.set(service.getPartnerKey(a, d), 10);
          history.set(service.getPartnerKey(b, c), 10);
          history.set(service.getPartnerKey(b, d), 10);

          // Split: {a,b} vs {c,d} — no within-team pairs have history
          expect(service.scoreSplit([a, b], [c, d], history)).toBe(0);
        }
      ),
      { numRuns: 500 }
    );
  });
});

// Feature: partner-uniqueness-optimization, Property 6: Optimizer Robustness
// For any 4 players and any partnership history (including high counts),
// optimizeTeamSplit returns a valid split of 2+2 without error
// **Validates: Requirements 3.1, 3.2**
describe('Partner Uniqueness - Property 6: Optimizer Robustness', () => {
  const { AssignmentService } = require('../../services/AssignmentService');
  const service = new AssignmentService();

  const playerIdArb = fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/);

  // Arbitrary: 4 unique player IDs as Player objects
  const fourPlayersArb = fc.uniqueArray(playerIdArb, { minLength: 4, maxLength: 4 }).map(
    ids => ids.map(id => ({ id, name: id, leagueId: 'l', createdAt: new Date() }))
  );

  // Arbitrary: partnership history with potentially high counts
  const partnershipHistoryArb = fc
    .array(
      fc.tuple(playerIdArb, playerIdArb, fc.integer({ min: 0, max: 10000 })),
      { minLength: 0, maxLength: 20 }
    )
    .map(entries => {
      const map = new Map<string, number>();
      for (const [a, b, count] of entries) {
        const key = service.getPartnerKey(a, b);
        map.set(key, (map.get(key) ?? 0) + count);
      }
      return map;
    });

  it('returns a valid 2+2 split for any 4 players and any partnership history', () => {
    fc.assert(
      fc.property(fourPlayersArb, partnershipHistoryArb, (players, history) => {
        const [team1, team2] = service.optimizeTeamSplit(players, history);

        // Both teams must have exactly 2 players
        expect(team1).toHaveLength(2);
        expect(team2).toHaveLength(2);

        // All 4 original player IDs must be present across both teams
        const allIds = [...team1, ...team2].sort();
        const originalIds = players.map((p: any) => p.id).sort();
        expect(allIds).toEqual(originalIds);

        // No duplicates across teams
        const uniqueIds = new Set([...team1, ...team2]);
        expect(uniqueIds.size).toBe(4);
      }),
      { numRuns: 1000 }
    );
  });

  it('returns a valid split when all pairings have very high counts', () => {
    fc.assert(
      fc.property(fourPlayersArb, (players) => {
        const ids = players.map((p: any) => p.id);
        const history = new Map<string, number>();
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            history.set(service.getPartnerKey(ids[i], ids[j]), 9999);
          }
        }

        const [team1, team2] = service.optimizeTeamSplit(players, history);

        expect(team1).toHaveLength(2);
        expect(team2).toHaveLength(2);

        const allIds = [...team1, ...team2].sort();
        const originalIds = ids.sort();
        expect(allIds).toEqual(originalIds);
      }),
      { numRuns: 500 }
    );
  });

  it('returns a valid split when partnership history is empty', () => {
    fc.assert(
      fc.property(fourPlayersArb, (players) => {
        const emptyHistory = new Map<string, number>();
        const [team1, team2] = service.optimizeTeamSplit(players, emptyHistory);

        expect(team1).toHaveLength(2);
        expect(team2).toHaveLength(2);

        const allIds = [...team1, ...team2].sort();
        const originalIds = players.map((p: any) => p.id).sort();
        expect(allIds).toEqual(originalIds);
      }),
      { numRuns: 500 }
    );
  });
});


// Feature: partner-uniqueness-optimization, Property 7: History Includes All Historical Players
// For any set of previous assignments containing player IDs not in current roster,
// buildPartnershipHistory includes entries for all historical players
// **Validates: Requirement 7.1**
describe('Partner Uniqueness - Property 7: History Includes All Historical Players', () => {
  const { AssignmentService } = require('../../services/AssignmentService');
  const service = new AssignmentService();

  const playerIdArb = fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/);

  // Arbitrary: a team of 2-4 unique player IDs
  const teamArb = fc.uniqueArray(playerIdArb, { minLength: 2, maxLength: 4 });

  // Arbitrary: a single assignment with two teams
  const assignmentArb = fc.tuple(teamArb, teamArb).map(([team1, team2]) => ({
    id: 'a-id',
    roundId: 'r-id',
    courtId: 'c-id',
    team1PlayerIds: team1,
    team2PlayerIds: team2,
    createdAt: new Date(),
  }));

  // Arbitrary: a list of 1-5 assignments
  const assignmentsArb = fc.array(assignmentArb, { minLength: 1, maxLength: 5 });

  // Arbitrary: a "current roster" that is a subset of all historical player IDs
  // We generate assignments first, then pick a subset of players as the "current roster"
  const scenarioArb = assignmentsArb.chain(assignments => {
    // Collect all unique player IDs from all assignments
    const allIds = new Set<string>();
    for (const a of assignments) {
      for (const id of [...a.team1PlayerIds, ...a.team2PlayerIds]) {
        allIds.add(id);
      }
    }
    const allIdsArray = [...allIds];
    // Generate a subset (possibly empty) to represent the "current roster"
    return fc.subarray(allIdsArray, { minLength: 0 }).map(currentRoster => ({
      assignments,
      currentRoster: new Set(currentRoster),
      allHistoricalIds: allIds,
    }));
  });

  it('partnership history includes pair entries for all players that appeared in assignments, regardless of current roster', () => {
    fc.assert(
      fc.property(scenarioArb, ({ assignments, allHistoricalIds }) => {
        const history = service.buildPartnershipHistory(assignments);

        // Collect all player IDs that appear in the history map keys
        const idsInHistory = new Set<string>();
        for (const key of history.keys()) {
          const [idA, idB] = key.split('_');
          idsInHistory.add(idA);
          idsInHistory.add(idB);
        }

        // Every player who was on a team with at least one other player
        // should appear in the history map
        for (const assignment of assignments) {
          for (const team of [assignment.team1PlayerIds, assignment.team2PlayerIds]) {
            if (team.length >= 2) {
              for (const playerId of team) {
                expect(idsInHistory.has(playerId)).toBe(true);
              }
            }
          }
        }
      }),
      { numRuns: 1000 }
    );
  });

  it('history entries are not filtered by any external roster — deleted players remain in the map', () => {
    fc.assert(
      fc.property(scenarioArb, ({ assignments, currentRoster, allHistoricalIds }) => {
        const history = service.buildPartnershipHistory(assignments);

        // Collect IDs that appear in teams of size >= 2 (i.e., they form at least one pair)
        const idsWithPairs = new Set<string>();
        for (const assignment of assignments) {
          for (const team of [assignment.team1PlayerIds, assignment.team2PlayerIds]) {
            if (team.length >= 2) {
              for (const id of team) {
                idsWithPairs.add(id);
              }
            }
          }
        }

        // IDs NOT in the current roster but that formed pairs should still be in history
        for (const id of idsWithPairs) {
          if (!currentRoster.has(id)) {
            // This "deleted" player should still appear in at least one history key
            let foundInHistory = false;
            for (const key of history.keys()) {
              if (key.split('_').includes(id)) {
                foundInHistory = true;
                break;
              }
            }
            expect(foundInHistory).toBe(true);
          }
        }
      }),
      { numRuns: 1000 }
    );
  });

  it('history counts are identical whether or not a player is in the current roster', () => {
    fc.assert(
      fc.property(scenarioArb, ({ assignments }) => {
        // Build history twice — the function doesn't take a roster, so the result
        // must be deterministic and roster-independent
        const history1 = service.buildPartnershipHistory(assignments);
        const history2 = service.buildPartnershipHistory(assignments);

        expect(history1.size).toBe(history2.size);
        for (const [key, count] of history1) {
          expect(history2.get(key)).toBe(count);
        }
      }),
      { numRuns: 500 }
    );
  });
});


// Feature: partner-uniqueness-optimization, Property 8: Scoring Excludes Non-Court Players
// For any partnership history containing pairs with non-court players,
// scoreSplit only sums counts for pairs where both IDs are in the court group
// **Validates: Requirements 7.2, 8.1, 8.2**
describe('Partner Uniqueness - Property 8: Scoring Excludes Non-Court Players', () => {
  const { AssignmentService } = require('../../services/AssignmentService');
  const service = new AssignmentService();

  const playerIdArb = fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/);

  // Arbitrary: 4 unique court player IDs
  const courtPlayerIdsArb = fc.uniqueArray(playerIdArb, { minLength: 4, maxLength: 4 });

  // Arbitrary: 1-4 unique non-court player IDs (guaranteed distinct from court players)
  const nonCourtPlayerIdsArb = fc.uniqueArray(playerIdArb, { minLength: 1, maxLength: 4 });

  // Arbitrary: partnership counts
  const countArb = fc.integer({ min: 1, max: 50 });

  it('scoreSplit only sums counts for pairs where both players are in the court group', () => {
    fc.assert(
      fc.property(courtPlayerIdsArb, nonCourtPlayerIdsArb, countArb, (courtIds, nonCourtIds, baseCount) => {
        // Ensure non-court IDs are actually distinct from court IDs
        const courtSet = new Set(courtIds);
        const filteredNonCourt = nonCourtIds.filter(id => !courtSet.has(id));
        if (filteredNonCourt.length === 0) return; // skip if no distinct non-court players

        const [a, b, c, d] = courtIds;

        // Build a history that includes both court-player pairs and non-court-player pairs
        const history = new Map<string, number>();

        // Add counts for within-court pairs
        history.set(service.getPartnerKey(a, b), baseCount);
        history.set(service.getPartnerKey(c, d), baseCount + 1);

        // Add counts for pairs involving non-court players
        for (const ncId of filteredNonCourt) {
          for (const cId of courtIds) {
            history.set(service.getPartnerKey(ncId, cId), 999);
          }
          // Also add pairs between non-court players
          for (const ncId2 of filteredNonCourt) {
            if (ncId < ncId2) {
              history.set(service.getPartnerKey(ncId, ncId2), 999);
            }
          }
        }

        // Score the split {a,b} vs {c,d}
        const score = service.scoreSplit([a, b], [c, d], history);

        // Expected: only within-team court pairs count
        // team1 pair (a,b) = baseCount, team2 pair (c,d) = baseCount + 1
        const expectedScore = baseCount + (baseCount + 1);
        expect(score).toBe(expectedScore);
      }),
      { numRuns: 1000 }
    );
  });

  it('scoreSplit returns 0 when all history entries involve non-court players', () => {
    fc.assert(
      fc.property(courtPlayerIdsArb, nonCourtPlayerIdsArb, countArb, (courtIds, nonCourtIds, count) => {
        const courtSet = new Set(courtIds);
        const filteredNonCourt = nonCourtIds.filter(id => !courtSet.has(id));
        if (filteredNonCourt.length < 2) return; // need at least 2 non-court players for pairs

        // Build history with only non-court player pairs
        const history = new Map<string, number>();
        for (let i = 0; i < filteredNonCourt.length; i++) {
          for (let j = i + 1; j < filteredNonCourt.length; j++) {
            history.set(service.getPartnerKey(filteredNonCourt[i], filteredNonCourt[j]), count);
          }
          // Also add cross pairs (non-court with court)
          for (const cId of courtIds) {
            history.set(service.getPartnerKey(filteredNonCourt[i], cId), count);
          }
        }

        const [a, b, c, d] = courtIds;
        // No within-court-team pairs exist in history, so score should be 0
        const score = service.scoreSplit([a, b], [c, d], history);
        expect(score).toBe(0);
      }),
      { numRuns: 1000 }
    );
  });

  it('adding non-court player pairs to history does not change the score for court teams', () => {
    fc.assert(
      fc.property(courtPlayerIdsArb, nonCourtPlayerIdsArb, countArb, (courtIds, nonCourtIds, count) => {
        const courtSet = new Set(courtIds);
        const filteredNonCourt = nonCourtIds.filter(id => !courtSet.has(id));

        const [a, b, c, d] = courtIds;

        // Build a baseline history with only court-player pairs
        const baseHistory = new Map<string, number>();
        baseHistory.set(service.getPartnerKey(a, b), count);
        baseHistory.set(service.getPartnerKey(c, d), count);

        const baseScore = service.scoreSplit([a, b], [c, d], baseHistory);

        // Build an augmented history that also includes non-court player pairs
        const augHistory = new Map<string, number>(baseHistory);
        for (const ncId of filteredNonCourt) {
          for (const cId of courtIds) {
            augHistory.set(service.getPartnerKey(ncId, cId), 999);
          }
          for (const ncId2 of filteredNonCourt) {
            if (ncId < ncId2) {
              augHistory.set(service.getPartnerKey(ncId, ncId2), 999);
            }
          }
        }

        const augScore = service.scoreSplit([a, b], [c, d], augHistory);

        // Score should be identical — non-court pairs don't affect it
        expect(augScore).toBe(baseScore);
      }),
      { numRuns: 1000 }
    );
  });
});


// Feature: partner-uniqueness-optimization, Property 9: Bye Counts Preserved Under Optimization
// For any league state with players, courts, and previous rounds, the bye count distribution
// produced when generating a round with partnership optimization enabled is identical to
// the bye count distribution produced without partnership optimization.
// **Validates: Requirement 9.3**
describe('Partner Uniqueness - Property 9: Bye Counts Preserved Under Optimization', () => {
  const { AssignmentService } = require('../../services/AssignmentService');
  const { dataStore } = require('../../data/DataStore');

  const playerIdArb = fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/);

  // Arbitrary: 4-10 unique player IDs as Player objects
  const playersArb = fc.uniqueArray(playerIdArb, { minLength: 4, maxLength: 10 }).map(
    ids => ids.map(id => ({ id, name: id, leagueId: 'l', createdAt: new Date() }))
  );

  // Arbitrary: 1-3 court objects
  const courtsArb = fc.integer({ min: 1, max: 3 }).map(n =>
    Array.from({ length: n }, (_, i) => ({
      id: `court-${i}`,
      identifier: `Court${i + 1}`,
      leagueId: 'l',
      createdAt: new Date(),
    }))
  );

  // Arbitrary: a bye count map assigning 0-5 byes to each player
  const byeCountMapArb = (players: { id: string }[]) =>
    fc.array(fc.integer({ min: 0, max: 5 }), { minLength: players.length, maxLength: players.length }).map(
      counts => {
        const map = new Map<string, number>();
        players.forEach((p, i) => map.set(p.id, counts[i]));
        return map;
      }
    );

  // Arbitrary: previous assignments for partnership history (0-8 assignments)
  const teamArb = fc.uniqueArray(playerIdArb, { minLength: 2, maxLength: 2 });
  const prevAssignmentArb = fc.tuple(teamArb, teamArb).map(([team1, team2]) => ({
    id: 'pa-id',
    roundId: 'pr-id',
    courtId: 'pc-id',
    team1PlayerIds: team1,
    team2PlayerIds: team2,
    createdAt: new Date(),
  }));
  const prevAssignmentsArb = fc.array(prevAssignmentArb, { minLength: 0, maxLength: 8 });

  it('number of bye players is identical with and without partnership optimization', () => {
    fc.assert(
      fc.property(
        playersArb.chain(players =>
          fc.tuple(
            fc.constant(players),
            courtsArb,
            byeCountMapArb(players),
            prevAssignmentsArb
          )
        ),
        ([players, courts, byeCountMap, prevAssignments]) => {
          const service = new AssignmentService();

          // Generate assignments WITHOUT partnership optimization
          dataStore.clear();
          const roundIdA = 'round-no-opt';
          const assignmentsWithout = service.generateAssignments(
            players,
            courts,
            roundIdA,
            4,
            undefined,
            byeCountMap,
            undefined // no allPreviousAssignments
          );

          // Collect assigned player IDs (without optimization)
          const assignedWithout = new Set<string>();
          for (const a of assignmentsWithout) {
            for (const pid of [...a.team1PlayerIds, ...a.team2PlayerIds]) {
              assignedWithout.add(pid);
            }
          }
          const byeCountWithout = players.length - assignedWithout.size;

          // Generate assignments WITH partnership optimization
          dataStore.clear();
          const roundIdB = 'round-with-opt';
          const assignmentsWith = service.generateAssignments(
            players,
            courts,
            roundIdB,
            4,
            undefined,
            byeCountMap,
            prevAssignments // allPreviousAssignments provided
          );

          // Collect assigned player IDs (with optimization)
          const assignedWith = new Set<string>();
          for (const a of assignmentsWith) {
            for (const pid of [...a.team1PlayerIds, ...a.team2PlayerIds]) {
              assignedWith.add(pid);
            }
          }
          const byeCountWith = players.length - assignedWith.size;

          // The number of bye players must be identical
          expect(byeCountWith).toBe(byeCountWithout);

          // The number of assignments (courts used) must be identical
          expect(assignmentsWith.length).toBe(assignmentsWithout.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('bye count equals players minus courts*playersPerCourt (capped at player count), regardless of optimization', () => {
    fc.assert(
      fc.property(
        playersArb.chain(players =>
          fc.tuple(
            fc.constant(players),
            courtsArb,
            byeCountMapArb(players),
            prevAssignmentsArb
          )
        ),
        ([players, courts, byeCountMap, prevAssignments]) => {
          const service = new AssignmentService();
          const playersPerCourt = 4;

          // Expected bye count is deterministic based on player/court counts
          const playersNeeded = Math.min(players.length, courts.length * playersPerCourt);
          const fullCourts = Math.floor(playersNeeded / playersPerCourt);
          const slotsToFill = fullCourts * playersPerCourt;
          const expectedByes = players.length - slotsToFill;

          // WITH optimization
          dataStore.clear();
          const assignmentsWith = service.generateAssignments(
            players, courts, 'r-opt', 4, undefined, byeCountMap, prevAssignments
          );
          const assignedWith = new Set<string>();
          for (const a of assignmentsWith) {
            for (const pid of [...a.team1PlayerIds, ...a.team2PlayerIds]) {
              assignedWith.add(pid);
            }
          }
          expect(players.length - assignedWith.size).toBe(expectedByes);

          // WITHOUT optimization
          dataStore.clear();
          const assignmentsWithout = service.generateAssignments(
            players, courts, 'r-no-opt', 4, undefined, byeCountMap, undefined
          );
          const assignedWithout = new Set<string>();
          for (const a of assignmentsWithout) {
            for (const pid of [...a.team1PlayerIds, ...a.team2PlayerIds]) {
              assignedWithout.add(pid);
            }
          }
          expect(players.length - assignedWithout.size).toBe(expectedByes);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('bye-fair ordering priority is preserved — players with highest bye counts are assigned first regardless of optimization', () => {
    fc.assert(
      fc.property(
        // Generate 5 players with distinct bye counts to make ordering deterministic
        fc.uniqueArray(playerIdArb, { minLength: 5, maxLength: 5 }).chain(ids => {
          const players = ids.map(id => ({ id, name: id, leagueId: 'l', createdAt: new Date() }));
          // Assign distinct bye counts: 4, 3, 2, 1, 0
          const byeCountMap = new Map<string, number>();
          players.forEach((p, i) => byeCountMap.set(p.id, 4 - i));
          return fc.tuple(
            fc.constant(players),
            fc.constant(byeCountMap),
            prevAssignmentsArb
          );
        }),
        ([players, byeCountMap, prevAssignments]) => {
          const service = new AssignmentService();
          // 1 court, 4 players per court → 1 bye player
          const courts = [{ id: 'c1', identifier: 'Court1', leagueId: 'l', createdAt: new Date() }];

          // WITH optimization
          dataStore.clear();
          const assignmentsWith = service.generateAssignments(
            players, courts, 'r1', 4, undefined, byeCountMap, prevAssignments
          );
          const assignedWith = new Set<string>();
          for (const a of assignmentsWith) {
            for (const pid of [...a.team1PlayerIds, ...a.team2PlayerIds]) {
              assignedWith.add(pid);
            }
          }

          // WITHOUT optimization
          dataStore.clear();
          const assignmentsWithout = service.generateAssignments(
            players, courts, 'r2', 4, undefined, byeCountMap, undefined
          );
          const assignedWithout = new Set<string>();
          for (const a of assignmentsWithout) {
            for (const pid of [...a.team1PlayerIds, ...a.team2PlayerIds]) {
              assignedWithout.add(pid);
            }
          }

          // The player with the lowest bye count (0 byes) should be on bye in both cases
          // since all other players have higher bye counts and get priority
          const lowestByePlayer = players[4]; // bye count = 0
          expect(assignedWith.has(lowestByePlayer.id)).toBe(false);
          expect(assignedWithout.has(lowestByePlayer.id)).toBe(false);

          // Both should have exactly 1 bye player
          expect(players.length - assignedWith.size).toBe(1);
          expect(players.length - assignedWithout.size).toBe(1);
        }
      ),
      { numRuns: 50 }
    );
  });
});
