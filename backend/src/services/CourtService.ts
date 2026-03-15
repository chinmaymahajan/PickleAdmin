import { Court } from '../models/Court';
import { dataStore } from '../data/DataStore';
import { validateCourtIdentifier, ValidationResult } from '../utils/validation';

/**
 * Service for managing courts in leagues
 * Provides court creation, retrieval, and validation
 */
export class CourtService {
  /**
   * Add a new court to a league
   * 
   * @param leagueId - The ID of the league to add the court to
   * @param identifier - The identifier for the court
   * @returns The created court or validation error
   * @throws Error if validation fails
   */
  addCourt(leagueId: string, identifier: string): Court {
    // Validate court identifier
    const validation = validateCourtIdentifier(identifier);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Check for duplicate court identifier in this league
    const existing = dataStore.getCourtsByLeague(leagueId);
    if (existing.length >= 30) {
      throw new Error('Maximum of 30 courts per session reached');
    }
    if (existing.some(c => c.identifier === identifier.trim())) {
      throw new Error(`Court "${identifier.trim()}" already exists`);
    }

    // Create court entity
    const court: Court = {
      id: dataStore.generateId(),
      leagueId,
      identifier: identifier.trim(),
      createdAt: new Date()
    };

    // Store court
    return dataStore.createCourt(court);
  }

  /**
   * Get all courts for a specific league
   * 
   * @param leagueId - The ID of the league
   * @returns Array of courts in the league
   */
  getCourts(leagueId: string): Court[] {
    return dataStore.getCourtsByLeague(leagueId);
  }
  /**
   * Delete a court from a league
   */
  deleteCourt(courtId: string): boolean {
    return dataStore.deleteCourt(courtId);
  }

  /**
   * Validate a court identifier
   * 
   * @param identifier - The court identifier to validate
   * @returns ValidationResult indicating if the identifier is valid
   */
  validateCourtIdentifier(identifier: string): ValidationResult {
    return validateCourtIdentifier(identifier);
  }
}

// Export singleton instance
export const courtService = new CourtService();
