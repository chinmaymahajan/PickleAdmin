import { Player } from '../models/Player';
import { dataStore } from '../data/DataStore';
import { validatePlayerName, ValidationResult } from '../utils/validation';

/**
 * Service for managing players in leagues
 * Provides player creation, retrieval, and validation
 */
export class PlayerService {
  /**
   * Add a new player to a league
   * 
   * @param leagueId - The ID of the league to add the player to
   * @param name - The name of the player
   * @returns The created player or validation error
   * @throws Error if validation fails
   */
  addPlayer(leagueId: string, name: string): Player {
    // Validate player name
    const validation = validatePlayerName(name);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Check player limit
    const existing = dataStore.getPlayersByLeague(leagueId);
    if (existing.length >= 100) {
      throw new Error('Maximum of 100 players per session reached');
    }

    // Create player entity
    const player: Player = {
      id: dataStore.generateId(),
      leagueId,
      name: name.trim(),
      createdAt: new Date()
    };

    // Store player
    return dataStore.createPlayer(player);
  }

  /**
   * Get all players for a specific league
   * 
   * @param leagueId - The ID of the league
   * @returns Array of players in the league
   */
  getPlayers(leagueId: string): Player[] {
    return dataStore.getPlayersByLeague(leagueId);
  }
  /**
   * Delete a player from a league
   */
  deletePlayer(playerId: string): boolean {
    return dataStore.deletePlayer(playerId);
  }

  /**
   * Validate a player name
   * 
   * @param name - The player name to validate
   * @returns ValidationResult indicating if the name is valid
   */
  validatePlayerName(name: string): ValidationResult {
    return validatePlayerName(name);
  }
}

// Export singleton instance
export const playerService = new PlayerService();
