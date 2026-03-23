import React, { useState } from 'react';
import { Player, Assignment } from '../types';

interface LeaderboardProps {
  players: Player[];
  allAssignments: Assignment[];
}

interface PlayerStats {
  playerId: string;
  name: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ players, allAssignments }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [sortBy, setSortBy] = useState<'wins' | 'pointsFor' | 'pointDiff'>('wins');

  const stats = React.useMemo(() => {
    const map = new Map<string, PlayerStats>();
    for (const p of players) {
      map.set(p.id, {
        playerId: p.id,
        name: p.name,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
      });
    }

    if (!allAssignments) return [];

    for (const a of allAssignments) {
      if (a.team1Score == null || a.team2Score == null) continue;
      const t1Score = a.team1Score;
      const t2Score = a.team2Score;

      for (const pid of a.team1PlayerIds) {
        const s = map.get(pid);
        if (!s) continue;
        s.gamesPlayed++;
        s.pointsFor += t1Score;
        s.pointsAgainst += t2Score;
        s.pointDiff = s.pointsFor - s.pointsAgainst;
        if (t1Score > t2Score) s.wins++;
        else if (t1Score < t2Score) s.losses++;
        else s.draws++;
      }

      for (const pid of a.team2PlayerIds) {
        const s = map.get(pid);
        if (!s) continue;
        s.gamesPlayed++;
        s.pointsFor += t2Score;
        s.pointsAgainst += t1Score;
        s.pointDiff = s.pointsFor - s.pointsAgainst;
        if (t2Score > t1Score) s.wins++;
        else if (t2Score < t1Score) s.losses++;
        else s.draws++;
      }
    }

    const arr = [...map.values()].filter(s => s.gamesPlayed > 0);
    arr.sort((a, b) => {
      if (sortBy === 'wins') return b.wins - a.wins || b.pointDiff - a.pointDiff;
      if (sortBy === 'pointsFor') return b.pointsFor - a.pointsFor || b.wins - a.wins;
      return b.pointDiff - a.pointDiff || b.wins - a.wins;
    });
    return arr;
  }, [players, allAssignments, sortBy]);

  // Check if any scores have been entered
  const hasScores = allAssignments?.some(a => a.team1Score != null && a.team2Score != null) ?? false;
  if (!hasScores) return null;

  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <h3 onClick={() => setCollapsed(!collapsed)} style={{ cursor: 'pointer' }}>
          🏆 Leaderboard {collapsed ? '▸' : '▾'}
        </h3>
        {!collapsed && (
          <div className="leaderboard-sort">
            <button className={sortBy === 'wins' ? 'active' : ''} onClick={() => setSortBy('wins')}>W/L</button>
            <button className={sortBy === 'pointsFor' ? 'active' : ''} onClick={() => setSortBy('pointsFor')}>Points</button>
            <button className={sortBy === 'pointDiff' ? 'active' : ''} onClick={() => setSortBy('pointDiff')}>+/-</button>
          </div>
        )}
      </div>
      {!collapsed && (
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Played</th>
              <th>Won</th>
              <th>Lost</th>
              <th>For</th>
              <th>Against</th>
              <th>Diff</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={s.playerId} className={i < 3 ? `top-${i + 1}` : ''}>
                <td className="rank">{i + 1}</td>
                <td className="player-name">{s.name}</td>
                <td>{s.gamesPlayed}</td>
                <td className="wins">{s.wins}</td>
                <td>{s.losses}</td>
                <td>{s.pointsFor}</td>
                <td>{s.pointsAgainst}</td>
                <td className={s.pointDiff > 0 ? 'positive' : s.pointDiff < 0 ? 'negative' : ''}>{s.pointDiff > 0 ? '+' : ''}{s.pointDiff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Leaderboard;
