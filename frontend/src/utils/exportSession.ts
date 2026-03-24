import * as XLSX from 'xlsx';
import { Round, Assignment, Court, Player } from '../types';

interface ExportOptions {
  leagueName: string;
  rounds: Round[];
  assignments: Assignment[];
  courts: Court[];
  players: Player[];
}

function getPlayerName(players: Player[], id: string): string {
  return players.find(p => p.id === id)?.name ?? 'Unknown';
}

function getCourtIdentifier(courts: Court[], id: string): string {
  return courts.find(c => c.id === id)?.identifier ?? 'Unknown';
}

export function exportSessionXLSX({ leagueName, rounds, assignments, courts, players }: ExportOptions): void {
  const sortedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);

  const rows: Record<string, string | number>[] = [];

  for (const round of sortedRounds) {
    const roundAssignments = assignments
      .filter(a => a.roundId === round.id)
      .sort((a, b) => getCourtIdentifier(courts, a.courtId).localeCompare(getCourtIdentifier(courts, b.courtId)));

    for (const a of roundAssignments) {
      const team1 = a.team1PlayerIds.map(id => getPlayerName(players, id)).join(' & ');
      const team2 = a.team2PlayerIds.map(id => getPlayerName(players, id)).join(' & ');
      const row: Record<string, string | number> = {
        Round: `Round ${round.roundNumber}`,
        Court: getCourtIdentifier(courts, a.courtId),
        'Team 1': team1,
        'Team 2': team2,
      };
      if (a.team1Score != null && a.team2Score != null) {
        row['Team 1 Score'] = a.team1Score;
        row['Team 2 Score'] = a.team2Score;
      } else {
        row['Team 1 Score'] = '';
        row['Team 2 Score'] = '';
      }
      rows.push(row);
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths (wch = width in characters)
  ws['!cols'] = [
    { wch: 10 },  // Round
    { wch: 12 },  // Court
    { wch: 30 },  // Team 1
    { wch: 30 },  // Team 2
    { wch: 14 },  // Team 1 Score
    { wch: 14 },  // Team 2 Score
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Session');

  const filename = `${leagueName.replace(/[^a-zA-Z0-9]/g, '_')}_session.xlsx`;
  XLSX.writeFile(wb, filename);
}
