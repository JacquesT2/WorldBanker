'use client';
import { usePlayerStore } from '../../../store/player-store';
import { useWorldStore } from '../../../store/world-store';

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  return (
    <div className="h-1.5 w-20 bg-ink-800 rounded overflow-hidden">
      <div
        className="h-full bg-gold-400 transition-all"
        style={{ width: `${(value / max) * 100}%` }}
      />
    </div>
  );
}

export default function LeaderboardPage() {
  const scores   = usePlayerStore(s => s.leaderboard);
  const myPlayer = usePlayerStore(s => s.player);
  const clock    = useWorldStore(s => s.clock);

  const sorted = [...scores].sort((a, b) => a.rank - b.rank);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gold-400">Leaderboard</h2>
        {clock && (
          <p className="text-parch-200 text-sm capitalize">
            {clock.current_season} — Year {clock.current_year} — Tick {clock.current_tick}
          </p>
        )}
      </div>

      {sorted.length === 0 && (
        <p className="text-parch-200">No players yet.</p>
      )}

      <div className="space-y-2">
        {sorted.map(score => {
          const isMe = score.player_id === myPlayer?.id;
          return (
            <div
              key={score.player_id}
              className={`bg-ink-700 border rounded-lg p-4 ${
                isMe ? 'border-gold-400' : 'border-gold-600'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className={`text-2xl font-bold w-8 text-center ${
                    score.rank === 1 ? 'text-gold-400' :
                    score.rank === 2 ? 'text-parch-200' :
                    score.rank === 3 ? 'text-yellow-600' :
                    'text-parch-200'
                  }`}>
                    #{score.rank}
                  </span>
                  <div>
                    <p className={`font-semibold ${isMe ? 'text-gold-400' : 'text-parch-100'}`}>
                      {score.bank_name}
                      {isMe && <span className="ml-2 text-xs text-gold-400">(you)</span>}
                    </p>
                    <p className="text-parch-200 text-xs">{score.username}</p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xl font-bold font-mono text-gold-400">
                    {score.total_score.toFixed(1)}
                  </p>
                  <p className="text-xs text-parch-200">composite score</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-4 text-xs text-parch-200">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span>Net Worth (40%)</span>
                    <span className="font-mono text-parch-100">{score.net_worth_score.toFixed(1)}</span>
                  </div>
                  <ScoreBar value={score.net_worth_score} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span>Portfolio (30%)</span>
                    <span className="font-mono text-parch-100">{score.portfolio_quality_score.toFixed(1)}</span>
                  </div>
                  <ScoreBar value={score.portfolio_quality_score} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span>Reserves (30%)</span>
                    <span className="font-mono text-parch-100">{score.reserve_health_score.toFixed(1)}</span>
                  </div>
                  <ScoreBar value={score.reserve_health_score} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
