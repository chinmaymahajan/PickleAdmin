import { LeagueService } from '../LeagueService';
import { PlayerService } from '../PlayerService';
import { CourtService } from '../CourtService';
import { dataStore } from '../../data/DataStore';
import { LeagueFormat } from '../../models/League';

describe('Service Limits', () => {
  let leagueService: LeagueService;
  let playerService: PlayerService;
  let courtService: CourtService;

  beforeEach(() => {
    dataStore.clear();
    leagueService = new LeagueService();
    playerService = new PlayerService();
    courtService = new CourtService();
  });

  describe('League limit (10 sessions)', () => {
    it('should allow creating up to 10 sessions', () => {
      for (let i = 1; i <= 10; i++) {
        expect(() => leagueService.createLeague(`Session ${i}`)).not.toThrow();
      }
      expect(dataStore.getAllLeagues()).toHaveLength(10);
    });

    it('should reject creating an 11th session', () => {
      for (let i = 1; i <= 10; i++) {
        leagueService.createLeague(`Session ${i}`);
      }
      expect(() => leagueService.createLeague('Session 11'))
        .toThrow('Maximum of 10 active sessions reached');
    });

    it('should allow creating after deleting a session', () => {
      for (let i = 1; i <= 10; i++) {
        leagueService.createLeague(`Session ${i}`);
      }
      const leagues = dataStore.getAllLeagues();
      leagueService.deleteLeague(leagues[0].id);
      expect(() => leagueService.createLeague('New Session')).not.toThrow();
      expect(dataStore.getAllLeagues()).toHaveLength(10);
    });
  });

  describe('Player limit (100 per session)', () => {
    let leagueId: string;

    beforeEach(() => {
      const league = leagueService.createLeague('Test');
      leagueId = league.id;
    });

    it('should allow adding up to 100 players', () => {
      for (let i = 1; i <= 100; i++) {
        expect(() => playerService.addPlayer(leagueId, `Player ${i}`)).not.toThrow();
      }
      expect(dataStore.getPlayersByLeague(leagueId)).toHaveLength(100);
    });

    it('should reject adding a 101st player', () => {
      for (let i = 1; i <= 100; i++) {
        playerService.addPlayer(leagueId, `Player ${i}`);
      }
      expect(() => playerService.addPlayer(leagueId, 'Player 101'))
        .toThrow('Maximum of 100 players per session reached');
    });

    it('should allow adding after removing a player', () => {
      for (let i = 1; i <= 100; i++) {
        playerService.addPlayer(leagueId, `Player ${i}`);
      }
      const players = dataStore.getPlayersByLeague(leagueId);
      playerService.deletePlayer(players[0].id);
      expect(() => playerService.addPlayer(leagueId, 'New Player')).not.toThrow();
    });

    it('should enforce limit per session independently', () => {
      const league2 = leagueService.createLeague('Test 2');
      for (let i = 1; i <= 100; i++) {
        playerService.addPlayer(leagueId, `Player ${i}`);
      }
      // Different session should still allow players
      expect(() => playerService.addPlayer(league2.id, 'Player 1')).not.toThrow();
    });
  });

  describe('Court limit (30 per session)', () => {
    let leagueId: string;

    beforeEach(() => {
      const league = leagueService.createLeague('Test');
      leagueId = league.id;
    });

    it('should allow adding up to 30 courts', () => {
      for (let i = 1; i <= 30; i++) {
        expect(() => courtService.addCourt(leagueId, `Court ${i}`)).not.toThrow();
      }
      expect(dataStore.getCourtsByLeague(leagueId)).toHaveLength(30);
    });

    it('should reject adding a 31st court', () => {
      for (let i = 1; i <= 30; i++) {
        courtService.addCourt(leagueId, `Court ${i}`);
      }
      expect(() => courtService.addCourt(leagueId, 'Court 31'))
        .toThrow('Maximum of 30 courts per session reached');
    });

    it('should allow adding after removing a court', () => {
      for (let i = 1; i <= 30; i++) {
        courtService.addCourt(leagueId, `Court ${i}`);
      }
      const courts = dataStore.getCourtsByLeague(leagueId);
      courtService.deleteCourt(courts[0].id);
      expect(() => courtService.addCourt(leagueId, 'Court 99')).not.toThrow();
    });

    it('should enforce limit per session independently', () => {
      const league2 = leagueService.createLeague('Test 2');
      for (let i = 1; i <= 30; i++) {
        courtService.addCourt(leagueId, `Court ${i}`);
      }
      expect(() => courtService.addCourt(league2.id, 'Court 1')).not.toThrow();
    });
  });
});
