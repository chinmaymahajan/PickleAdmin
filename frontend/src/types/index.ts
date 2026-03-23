/**
 * Shared TypeScript interfaces for frontend
 * These mirror the backend data models
 */

export enum LeagueFormat {
  ROUND_ROBIN = 'round_robin',
  // Future formats can be added here
  // SINGLE_ELIMINATION = 'single_elimination',
  // DOUBLE_ELIMINATION = 'double_elimination',
}

export interface League {
  id: string;
  name: string;
  format: LeagueFormat;
  createdAt: Date;
  updatedAt: Date;
}

export interface Player {
  id: string;
  leagueId: string;
  name: string;
  createdAt: Date;
}

export interface Court {
  id: string;
  leagueId: string;
  identifier: string;
  createdAt: Date;
}

export interface Round {
  id: string;
  leagueId: string;
  roundNumber: number;
  createdAt: Date;
}

export interface Assignment {
  id: string;
  roundId: string;
  courtId: string;
  team1PlayerIds: string[];
  team2PlayerIds: string[];
  team1Score?: number;
  team2Score?: number;
  createdAt: Date;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
