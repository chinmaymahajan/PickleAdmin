import { League, LeagueFormat } from '../models/League';
import { dataStore } from '../data/DataStore';

/**
 * Service for managing leagues
 * Provides league creation, retrieval, listing, and selection
 */
export class LeagueService {
  private selectedLeagueId: string | null = null;

  /**
   * Create a new league
   * 
   * @param name - The name of the league
   * @param format - The format of the league (defaults to Round Robin)
   * @returns The created league
   */
  createLeague(name: string, format: LeagueFormat = LeagueFormat.ROUND_ROBIN): League {
    // Check session limit
    const existing = dataStore.getAllLeagues();
    if (existing.length >= 10) {
      throw new Error('Maximum of 10 active sessions reached');
    }

    const now = new Date();
    const league: League = {
      id: dataStore.generateId(),
      name,
      format,
      createdAt: now,
      updatedAt: now
    };

    return dataStore.createLeague(league);
  }

  /**
   * Get a specific league by ID
   * 
   * @param leagueId - The ID of the league to retrieve
   * @returns The league if found, undefined otherwise
   */
  getLeague(leagueId: string): League | undefined {
    return dataStore.getLeague(leagueId);
  }

  /**
   * List all leagues
   * 
   * @returns Array of all leagues
   */
  listLeagues(): League[] {
    return dataStore.getAllLeagues();
  }

  /**
   * Select a league as the active league
   * 
   * @param leagueId - The ID of the league to select
   * @throws Error if league not found
   */
  selectLeague(leagueId: string): void {
    const league = dataStore.getLeague(leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    this.selectedLeagueId = leagueId;
  }

  /**
   * Get the currently selected league ID
   * 
   * @returns The selected league ID or null if none selected
   */
  getSelectedLeagueId(): string | null {
    return this.selectedLeagueId;
  }

  /**
   * Clear the selected league (primarily for testing)
   */
  clearSelection(): void {
    this.selectedLeagueId = null;
  }
  /**
   * Delete a league and all its associated data (players, courts, rounds, assignments)
   *
   * @param leagueId - The ID of the league to delete
   * @throws Error if league not found
   */
  deleteLeague(leagueId: string): void {
    const league = dataStore.getLeague(leagueId);
    if (!league) {
      throw new Error('League not found');
    }

    // Delete all assignments for all rounds in this league
    const rounds = dataStore.getRoundsByLeague(leagueId);
    for (const round of rounds) {
      const assignments = dataStore.getAssignmentsByRound(round.id);
      for (const a of assignments) {
        dataStore.deleteAssignment(a.id);
      }
      dataStore.deleteRound(round.id);
    }

    // Delete all players and courts
    const players = dataStore.getPlayersByLeague(leagueId);
    for (const p of players) {
      dataStore.deletePlayer(p.id);
    }
    const courts = dataStore.getCourtsByLeague(leagueId);
    for (const c of courts) {
      dataStore.deleteCourt(c.id);
    }

    // Clear selection if this was the selected league
    if (this.selectedLeagueId === leagueId) {
      this.selectedLeagueId = null;
    }

    dataStore.deleteLeague(leagueId);
  }
}

// Export singleton instance
export const leagueService = new LeagueService();
