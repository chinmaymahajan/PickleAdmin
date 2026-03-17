import { Assignment } from '../models/Assignment';
import { Round } from '../models/Round';
import { dataStore } from '../data/DataStore';
import { assignmentService } from './AssignmentService';

/**
 * Service for managing rounds and round generation
 * Provides round creation, retrieval, and navigation capabilities
 */
export class RoundService {
  /**
   * Generate a new round for a league
   * 
   * Process:
   * 1. Validate that players and courts exist
   * 2. Determine the next round number (increment from highest existing round)
   * 3. Create the round entity
   * 4. Delegate to AssignmentService to generate player assignments
   * 5. Store round and return it
   * 
   * @param leagueId - The ID of the league to generate a round for
   * @returns The newly created round
   * @throws Error if no players or no courts exist in the league
   */
  /**
     * Generate a new round for a league
     * 
     * Process:
     * 1. Validate that players and courts exist
     * 2. Determine the next round number (increment from highest existing round)
     * 3. Create the round entity
     * 4. Get previous round assignments if this is not the first round
     * 5. Delegate to AssignmentService to generate player assignments
     * 6. Store round and return it
     * 
     * @param leagueId - The ID of the league to generate a round for
     * @returns The newly created round
     * @throws Error if no players or no courts exist in the league
     */
    generateRound(leagueId: string): Round {
      // Validate players exist
      const players = dataStore.getPlayersByLeague(leagueId);
      if (players.length === 0) {
        throw new Error('Cannot generate round: no players in session');
      }

      // Validate courts exist
      const courts = dataStore.getCourtsByLeague(leagueId);
      if (courts.length === 0) {
        throw new Error('Cannot generate round: no courts in session');
      }

      // Determine next round number
      const existingRounds = dataStore.getRoundsByLeague(leagueId);
      const nextRoundNumber = existingRounds.length > 0
        ? Math.max(...existingRounds.map(r => r.roundNumber)) + 1
        : 1;

      // Create round
      const round: Round = {
        id: dataStore.generateId(),
        leagueId,
        roundNumber: nextRoundNumber,
        createdAt: new Date()
      };

      dataStore.createRound(round);

      // Compute bye counts across ALL previous rounds
      const byeCountMap = new Map<string, number>();
      const playerIds = new Set(players.map(p => p.id));

      // Initialize all players with 0 byes
      for (const pid of playerIds) {
        byeCountMap.set(pid, 0);
      }

      for (const prevRound of existingRounds) {
        const roundAssignments = assignmentService.getAssignments(prevRound.id);
        const assignedInRound = new Set<string>();
        for (const a of roundAssignments) {
          a.team1PlayerIds.forEach(id => assignedInRound.add(id));
          a.team2PlayerIds.forEach(id => assignedInRound.add(id));
        }
        // Anyone not assigned in this round gets a bye count increment
        for (const pid of playerIds) {
          if (!assignedInRound.has(pid)) {
            byeCountMap.set(pid, (byeCountMap.get(pid) || 0) + 1);
          }
        }
      }

      // Get previous round assignments for team variety check
      let previousAssignments;
      if (existingRounds.length > 0) {
        const previousRound = existingRounds[existingRounds.length - 1];
        previousAssignments = assignmentService.getAssignments(previousRound.id);
      }

      // Collect ALL previous assignments for partnership history optimization
      const allPreviousAssignments: Assignment[] = [];
      for (const prevRound of existingRounds) {
        const roundAssignments = assignmentService.getAssignments(prevRound.id);
        allPreviousAssignments.push(...roundAssignments);
      }

      // Generate assignments for this round with bye count fairness and partnership optimization
      assignmentService.generateAssignments(
        players,
        courts,
        round.id,
        4, // playersPerCourt
        previousAssignments,
        byeCountMap,
        allPreviousAssignments
      );

      return round;
    }

  /**
   * Get a specific round by round number
   * 
   * @param leagueId - The ID of the league
   * @param roundNumber - The round number to retrieve
   * @returns The round if found
   * @throws Error if round not found
   */
  getRound(leagueId: string, roundNumber: number): Round {
    const rounds = dataStore.getRoundsByLeague(leagueId);
    const round = rounds.find(r => r.roundNumber === roundNumber);
    
    if (!round) {
      throw new Error('Round not found');
    }
    
    return round;
  }

  /**
   * List all rounds for a league in chronological order
   * 
   * @param leagueId - The ID of the league
   * @returns Array of rounds sorted by round number (ascending)
   */
  listRounds(leagueId: string): Round[] {
    return dataStore.getRoundsByLeague(leagueId);
  }

  /**
   * Get bye counts for all players across all rounds in a league
   * 
   * @param leagueId - The ID of the league
   * @returns Map of player ID to bye count
   */
  getByeCounts(leagueId: string): Record<string, number> {
    const players = dataStore.getPlayersByLeague(leagueId);
    const rounds = dataStore.getRoundsByLeague(leagueId);
    const byeCounts: Record<string, number> = {};

    for (const p of players) {
      byeCounts[p.id] = 0;
    }

    for (const round of rounds) {
      const roundAssignments = assignmentService.getAssignments(round.id);
      const assignedInRound = new Set<string>();
      for (const a of roundAssignments) {
        a.team1PlayerIds.forEach(id => assignedInRound.add(id));
        a.team2PlayerIds.forEach(id => assignedInRound.add(id));
      }
      for (const p of players) {
        if (!assignedInRound.has(p.id)) {
          byeCounts[p.id]++;
        }
      }
    }

    return byeCounts;
  }

  /**
   * Regenerate all rounds after a given round number.
   * Deletes future rounds and their assignments, then re-generates them
   * with the current player/court roster and fair bye distribution.
   *
   * @param leagueId - The league ID
   * @param afterRoundNumber - Keep this round and all before it; regenerate everything after
   * @returns The updated list of all rounds
   */
  regenerateFutureRounds(leagueId: string, afterRoundNumber: number): Round[] {
    const allRounds = dataStore.getRoundsByLeague(leagueId);
    const roundsToKeep = allRounds.filter(r => r.roundNumber <= afterRoundNumber);
    const roundsToDelete = allRounds.filter(r => r.roundNumber > afterRoundNumber);
    const numToRegenerate = roundsToDelete.length;

    // Delete future rounds and their assignments
    for (const round of roundsToDelete) {
      const assignments = dataStore.getAssignmentsByRound(round.id);
      for (const a of assignments) {
        dataStore.deleteAssignment(a.id);
      }
      dataStore.deleteRound(round.id);
    }

    // Regenerate that many rounds using the current roster
    for (let i = 0; i < numToRegenerate; i++) {
      this.generateRound(leagueId);
    }

    return dataStore.getRoundsByLeague(leagueId);
  }

  /**
   * Get the most recent round for a league
   * 
   * @param leagueId - The ID of the league
   * @returns The most recent round
   * @throws Error if no rounds exist
   */
  getCurrentRound(leagueId: string): Round {
    const rounds = dataStore.getRoundsByLeague(leagueId);
    
    if (rounds.length === 0) {
      throw new Error('No rounds found for league');
    }
    
    // Rounds are already sorted by round number, so get the last one
    return rounds[rounds.length - 1];
  }

  /**
   * Clear all rounds and their assignments for a league
   * 
   * @param leagueId - The ID of the league
   */
  clearRounds(leagueId: string): void {
    const allRounds = dataStore.getRoundsByLeague(leagueId);
    for (const round of allRounds) {
      const assignments = dataStore.getAssignmentsByRound(round.id);
      for (const a of assignments) {
        dataStore.deleteAssignment(a.id);
      }
      dataStore.deleteRound(round.id);
    }
  }
}

// Export singleton instance
export const roundService = new RoundService();
