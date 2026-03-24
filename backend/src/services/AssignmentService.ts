import { Assignment } from '../models/Assignment';
import { Player } from '../models/Player';
import { Court } from '../models/Court';
import { dataStore } from '../data/DataStore';
import { shuffle } from '../utils/shuffle';

/**
 * Service for managing player assignments to courts and teams
 * Provides assignment generation, retrieval, and reassignment capabilities
 */
export class AssignmentService {
  /**
   * Generate a canonical key for a player pair.
   * Always sorts IDs lexicographically so (A,B) and (B,A) produce the same key.
   */
  getPartnerKey(playerIdA: string, playerIdB: string): string {
    return playerIdA < playerIdB
      ? `${playerIdA}_${playerIdB}`
      : `${playerIdB}_${playerIdA}`;
  }

  /**
   * Build a partnership history map from all previous assignments.
   * Key: canonical pair key "idA_idB" (lexicographically sorted)
   * Value: number of rounds the pair was on the same team
   */
  buildPartnershipHistory(
    allPreviousAssignments: Assignment[] | undefined
  ): Map<string, number> {
    const history = new Map<string, number>();

    if (!allPreviousAssignments || allPreviousAssignments.length === 0) {
      return history;
    }

    for (const assignment of allPreviousAssignments) {
      const teams = [assignment.team1PlayerIds, assignment.team2PlayerIds];
      for (const team of teams) {
        for (let i = 0; i < team.length; i++) {
          for (let j = i + 1; j < team.length; j++) {
            const key = this.getPartnerKey(team[i], team[j]);
            history.set(key, (history.get(key) ?? 0) + 1);
          }
        }
      }
    }

    return history;
  }

  /**
   * Build an opponent history map from all previous assignments.
   * Key: canonical pair key "idA_idB" (lexicographically sorted)
   * Value: number of rounds the pair was on opposing teams
   */
  buildOpponentHistory(
    allPreviousAssignments: Assignment[] | undefined
  ): Map<string, number> {
    const history = new Map<string, number>();

    if (!allPreviousAssignments || allPreviousAssignments.length === 0) {
      return history;
    }

    for (const assignment of allPreviousAssignments) {
      const t1 = assignment.team1PlayerIds;
      const t2 = assignment.team2PlayerIds;
      for (const p1 of t1) {
        for (const p2 of t2) {
          const key = this.getPartnerKey(p1, p2);
          history.set(key, (history.get(key) ?? 0) + 1);
        }
      }
    }

    return history;
  }

  /**
   * Score a candidate split by summing partnership counts for all
   * within-team pairs AND opponent counts for all cross-team pairs.
   * Lower is better. Opponent repeats are weighted equally with partner repeats.
   */
  scoreSplit(
    team1Ids: string[],
    team2Ids: string[],
    partnershipHistory: Map<string, number>,
    opponentHistory?: Map<string, number>
  ): number {
    let score = 0;
    // Penalize repeat partners (same team)
    for (let i = 0; i < team1Ids.length; i++) {
      for (let j = i + 1; j < team1Ids.length; j++) {
        score += partnershipHistory.get(this.getPartnerKey(team1Ids[i], team1Ids[j])) ?? 0;
      }
    }
    for (let i = 0; i < team2Ids.length; i++) {
      for (let j = i + 1; j < team2Ids.length; j++) {
        score += partnershipHistory.get(this.getPartnerKey(team2Ids[i], team2Ids[j])) ?? 0;
      }
    }
    // Penalize repeat opponents (cross-team)
    if (opponentHistory && opponentHistory.size > 0) {
      for (const p1 of team1Ids) {
        for (const p2 of team2Ids) {
          score += opponentHistory.get(this.getPartnerKey(p1, p2)) ?? 0;
        }
      }
    }
    return score;
  }

  /**
   * Find the optimal 2v2 team split for a group of 4 players.
   * Evaluates all 3 possible splits and returns the one with the lowest
   * cumulative partnership score. On ties, selects randomly among tied splits.
   *
   * For 4 players [A, B, C, D], the 3 possible splits are:
   *   Split 1: {A,B} vs {C,D}
   *   Split 2: {A,C} vs {B,D}
   *   Split 3: {A,D} vs {B,C}
   *
   * @returns [team1PlayerIds, team2PlayerIds] — the best split
   */
  optimizeTeamSplit(
    courtPlayers: Player[],
    partnershipHistory: Map<string, number>,
    opponentHistory?: Map<string, number>
  ): [string[], string[]] {
    const ids = courtPlayers.map(p => p.id);
    const [a, b, c, d] = ids;

    const splits: [string[], string[]][] = [
      [[a, b], [c, d]],
      [[a, c], [b, d]],
      [[a, d], [b, c]],
    ];

    const scored = splits.map(([t1, t2]) => ({
      team1: t1,
      team2: t2,
      score: this.scoreSplit(t1, t2, partnershipHistory, opponentHistory),
    }));

    const minScore = Math.min(...scored.map(s => s.score));
    const best = scored.filter(s => s.score === minScore);

    const pick = best[Math.floor(Math.random() * best.length)];
    return [pick.team1, pick.team2];
  }


  /**
   * Generate assignments for a round by distributing players across courts
   * 
   * Algorithm:
   * 1. Shuffle players randomly using Fisher-Yates algorithm
   * 2. Calculate players per court (default 4 for 2v2 pickleball)
   * 3. Assign players to courts sequentially
   * 4. Form teams by splitting court players (first half vs second half)
   * 5. Handle overflow players with bye/waiting system
   * 
   * @param players - Array of players to assign
   * @param courts - Array of available courts
   * @param roundId - The ID of the round these assignments belong to
   * @param playersPerCourt - Number of players per court (default 4 for 2v2)
   * @returns Array of assignments with team compositions
   */
  /**
     * Generate assignments for a round by distributing players across courts
     * 
     * Algorithm:
     * 1. Shuffle players randomly using Fisher-Yates algorithm
     * 2. Calculate players per court (default 4 for 2v2 pickleball)
     * 3. Assign players to courts sequentially
     * 4. Form teams by splitting court players (first half vs second half)
     * 5. Handle overflow players with bye/waiting system
     * 6. If previousAssignments provided, ensure team compositions differ
     * 
     * @param players - Array of players to assign
     * @param courts - Array of available courts
     * @param roundId - The ID of the round these assignments belong to
     * @param playersPerCourt - Number of players per court (default 4 for 2v2)
     * @param previousAssignments - Optional previous round assignments to ensure variety
     * @returns Array of assignments with team compositions
     */
    generateAssignments(
          players: Player[],
          courts: Court[],
          roundId: string,
          playersPerCourt: number = 4,
          previousAssignments?: Assignment[],
          byeCountMap?: Map<string, number>,
          allPreviousAssignments?: Assignment[]
        ): Assignment[] {
          // Validate inputs
          if (players.length === 0) {
            throw new Error('Cannot generate assignments: no players available');
          }

          if (courts.length === 0) {
            throw new Error('Cannot generate assignments: no courts available');
          }

          // Build bye count map from previous assignments if not provided
          const effectiveByeCountMap = byeCountMap || new Map<string, number>();

          // Build partnership history from all previous assignments
          const partnershipHistoryMap = this.buildPartnershipHistory(allPreviousAssignments);

          // Build opponent history from all previous assignments
          const opponentHistoryMap = this.buildOpponentHistory(allPreviousAssignments);

          const maxRetries = 10;
          let attempts = 0;
          let assignments: Assignment[] = [];

          // Keep generating until we get different team compositions or hit max retries
          while (attempts < maxRetries) {
            assignments = this.createAssignments(
              players,
              courts,
              roundId,
              playersPerCourt,
              effectiveByeCountMap,
              partnershipHistoryMap,
              opponentHistoryMap
            );

            // If no previous assignments, we're done
            if (!previousAssignments || previousAssignments.length === 0) {
              break;
            }

            // Check if team compositions are different
            if (!this.areTeamCompositionsIdentical(assignments, previousAssignments)) {
              break;
            }

            attempts++;
          }

          // Store assignments in dataStore
          assignments.forEach(assignment => {
            dataStore.createAssignment(assignment);
          });

          return assignments;
        }


    /**
     * Create assignments, prioritizing players with the most byes.
     * Players are sorted by bye count (descending) so those who have sat out
     * the most get priority to play. Within the same bye count, players are
     * shuffled randomly.
     *
     * @private
     */
    private createAssignments(
          players: Player[],
          courts: Court[],
          roundId: string,
          playersPerCourt: number,
          byeCountMap: Map<string, number> = new Map(),
          partnershipHistoryMap: Map<string, number> = new Map(),
          opponentHistoryMap: Map<string, number> = new Map()
        ): Assignment[] {
          const playersNeeded = Math.min(players.length, courts.length * playersPerCourt);
          // Number of full courts we can fill
          const fullCourts = Math.floor(playersNeeded / playersPerCourt);
          const slotsToFill = fullCourts * playersPerCourt;

          // Group players by bye count
          const byeCountGroups = new Map<number, Player[]>();
          for (const p of players) {
            const count = byeCountMap.get(p.id) || 0;
            if (!byeCountGroups.has(count)) byeCountGroups.set(count, []);
            byeCountGroups.get(count)!.push(p);
          }

          // Sort groups by bye count descending (most byes first = highest priority to play)
          const sortedCounts = [...byeCountGroups.keys()].sort((a, b) => b - a);

          // Shuffle within each group, then concatenate
          const ordered: Player[] = [];
          for (const count of sortedCounts) {
            ordered.push(...shuffle([...byeCountGroups.get(count)!]));
          }

          // Take exactly enough players to fill full courts — priority players first
          const playersToAssign = ordered.slice(0, slotsToFill);

          // Try multiple shuffles and pick the one with the lowest opponent+partner repeat score
          // for the court groupings (which 4 players end up on the same court).
          const groupingAttempts = Math.min(20, Math.max(5, players.length));
          let bestGrouping: Player[] = shuffle([...playersToAssign]);
          let bestGroupingScore = Infinity;

          for (let attempt = 0; attempt < groupingAttempts; attempt++) {
            const candidate = shuffle([...playersToAssign]);
            let groupScore = 0;

            // Score each court group of 4
            for (let i = 0; i < candidate.length; i += playersPerCourt) {
              const group = candidate.slice(i, i + playersPerCourt);
              if (group.length < playersPerCourt) break;
              const ids = group.map(p => p.id);

              // Sum opponent history for all pairs in this group
              // (they'll be opponents or partners — either way we want variety)
              for (let a = 0; a < ids.length; a++) {
                for (let b = a + 1; b < ids.length; b++) {
                  const key = this.getPartnerKey(ids[a], ids[b]);
                  groupScore += (opponentHistoryMap.get(key) ?? 0);
                  groupScore += (partnershipHistoryMap.get(key) ?? 0);
                }
              }
            }

            if (groupScore < bestGroupingScore) {
              bestGroupingScore = groupScore;
              bestGrouping = candidate;
              if (groupScore === 0) break; // Perfect — no repeats at all
            }
          }

          const finalOrder = bestGrouping;

          // Shuffle courts for variety
          const shuffledCourts = shuffle([...courts]);

          const assignments: Assignment[] = [];
          let playerIndex = 0;

          for (const court of shuffledCourts) {
            const courtPlayers = finalOrder.slice(
              playerIndex,
              playerIndex + playersPerCourt
            );

            if (courtPlayers.length === playersPerCourt) {
              let team1Ids: string[];
              let team2Ids: string[];

              if (partnershipHistoryMap.size > 0 && playersPerCourt === 4) {
                // Use partnership-aware and opponent-aware team splitting
                [team1Ids, team2Ids] = this.optimizeTeamSplit(courtPlayers, partnershipHistoryMap, opponentHistoryMap);
              } else {
                // Default: simple first-half/second-half split
                const teamSize = playersPerCourt / 2;
                team1Ids = courtPlayers.slice(0, teamSize).map(p => p.id);
                team2Ids = courtPlayers.slice(teamSize).map(p => p.id);
              }

              const assignment: Assignment = {
                id: dataStore.generateId(),
                roundId,
                courtId: court.id,
                team1PlayerIds: team1Ids,
                team2PlayerIds: team2Ids,
                createdAt: new Date()
              };

              assignments.push(assignment);
            }

            playerIndex += playersPerCourt;

            if (playerIndex >= finalOrder.length) {
              break;
            }
          }

          return assignments;
        }


    /**
     * Check if team compositions are identical between two sets of assignments
     * 
     * Two team compositions are considered identical if all teams from the new
     * assignments exist in the previous assignments (regardless of court assignment)
     * 
     * @private
     */
    private areTeamCompositionsIdentical(
      newAssignments: Assignment[],
      previousAssignments: Assignment[]
    ): boolean {
      // Extract all teams from both assignment sets
      const newTeams = this.extractTeams(newAssignments);
      const previousTeams = this.extractTeams(previousAssignments);

      // If different number of teams, they can't be identical
      if (newTeams.length !== previousTeams.length) {
        return false;
      }

      // Check if all new teams exist in previous teams
      return newTeams.every(newTeam => 
        previousTeams.some(prevTeam => this.areTeamsEqual(newTeam, prevTeam))
      );
    }

    /**
     * Extract all teams from assignments as sorted player ID arrays
     * 
     * @private
     */
    private extractTeams(assignments: Assignment[]): string[][] {
      const teams: string[][] = [];

      for (const assignment of assignments) {
        teams.push([...assignment.team1PlayerIds].sort());
        teams.push([...assignment.team2PlayerIds].sort());
      }

      return teams;
    }

    /**
     * Check if two teams have the same players
     * 
     * @private
     */
    private areTeamsEqual(team1: string[], team2: string[]): boolean {
      if (team1.length !== team2.length) {
        return false;
      }

      // Both arrays should already be sorted
      return team1.every((playerId, index) => playerId === team2[index]);
    }

  /**
   * Get all assignments for a specific round
   * 
   * @param roundId - The ID of the round
   * @returns Array of assignments for the round, sorted by court identifier
   */
  getAssignments(roundId: string): Assignment[] {
    const assignments = dataStore.getAssignmentsByRound(roundId);
    
    // Sort assignments by court identifier for consistent display
    return assignments.sort((a, b) => {
      const courtA = dataStore.getCourt(a.courtId);
      const courtB = dataStore.getCourt(b.courtId);
      
      if (!courtA || !courtB) return 0;
      
      return courtA.identifier.localeCompare(courtB.identifier);
    });
  }
  /**
   * Manually reassign players to courts and teams
   *
   * Accepts manual assignment overrides and updates the specified assignments
   * while preserving assignments that are not being overridden.
   *
   * @param roundId - The ID of the round to update
   * @param manualAssignments - Array of partial assignments with overrides
   * @returns Updated array of all assignments for the round
   * @throws Error if player or court references are invalid
   */
  reassignPlayers(
    roundId: string,
    manualAssignments: Array<{
      courtId: string;
      team1PlayerIds: string[];
      team2PlayerIds: string[];
    }>
  ): Assignment[] {
    // Get existing assignments for the round
    const existingAssignments = dataStore.getAssignmentsByRound(roundId);

    // Validate all player and court references in manual assignments
    for (const manual of manualAssignments) {
      // Validate court exists
      const court = dataStore.getCourt(manual.courtId);
      if (!court) {
        throw new Error(`Court not found: ${manual.courtId}`);
      }

      // Validate all player IDs exist
      const allPlayerIds = [...manual.team1PlayerIds, ...manual.team2PlayerIds];
      for (const playerId of allPlayerIds) {
        const player = dataStore.getPlayer(playerId);
        if (!player) {
          throw new Error(`Player not found: ${playerId}`);
        }
      }
    }

    // Update assignments
    for (const manual of manualAssignments) {
      // Find existing assignment for this court
      const existingAssignment = existingAssignments.find(
        a => a.courtId === manual.courtId
      );

      if (existingAssignment) {
        // Update existing assignment
        dataStore.updateAssignment(existingAssignment.id, {
          team1PlayerIds: manual.team1PlayerIds,
          team2PlayerIds: manual.team2PlayerIds
        });
      } else {
        // Create new assignment if none exists for this court
        const newAssignment: Assignment = {
          id: dataStore.generateId(),
          roundId,
          courtId: manual.courtId,
          team1PlayerIds: manual.team1PlayerIds,
          team2PlayerIds: manual.team2PlayerIds,
          createdAt: new Date()
        };
        dataStore.createAssignment(newAssignment);
      }
    }

    // Return all assignments for the round (including preserved ones)
    return this.getAssignments(roundId);
  }
}

// Export singleton instance
export const assignmentService = new AssignmentService();
