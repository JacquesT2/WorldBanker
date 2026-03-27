'use client';
import { usePlayerStore } from '../../../store/player-store';
import { useWorldStore } from '../../../store/world-store';

const BOT_DESCRIPTIONS: Record<string, string> = {
  iron_vault:       'Conservative · low-risk · strong collateral',
  goldthorn:        'Merchant trade bank · guilds & craftsmen',
  house_aldric:     'Noble financier · large prestige loans',
  reckless_capital: 'High-risk high-reward · aggressive lender',
  commons_bank:     'Community lender · farmers & craftsmen',
};

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  return (
    <div className="h-1.5 w-20 bg-parch-300 rounded overflow-hidden">
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
          <p className="text-ink-700 text-sm capitalize">
            {clock.current_season} — Year {clock.current_year} — Tick {clock.current_tick}
          </p>
        )}
      </div>

      {sorted.length === 0 && (
        <p className="text-ink-700">No players yet.</p>
      )}

      <div className="space-y-2">
        {sorted.map(score => {
          const isMe = score.player_id === myPlayer?.id;
          return (
            <div
              key={score.player_id}
              className={`bg-parch-50 border rounded-lg p-4 ${
                isMe ? 'border-gold-400' : 'border-parch-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className={`text-2xl font-bold w-8 text-center ${
                    score.rank === 1 ? 'text-gold-400' :
                    score.rank === 2 ? 'text-ink-700' :
                    score.rank === 3 ? 'text-amber-700' :
                    'text-ink-700'
                  }`}>
                    #{score.rank}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`font-semibold ${isMe ? 'text-gold-400' : 'text-ink-800'}`}>
                        {score.bank_name}
                      </p>
                      {score.is_bot && (
                        <span className="text-xs px-1.5 py-0.5 rounded border bg-parch-200 border-parch-300 text-ink-700 font-normal">
                          AI
                        </span>
                      )}
                      {isMe && <span className="text-xs text-gold-400">(you)</span>}
                    </div>
                    <p className="text-ink-700 text-xs">
                      {score.is_bot
                        ? BOT_DESCRIPTIONS[score.username.replace('bot_', '')] ?? score.username
                        : score.username}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xl font-bold font-mono text-gold-400">
                    {(score.total_score ?? 0).toFixed(1)}
                  </p>
                  <p className="text-xs text-ink-700">composite score</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-4 text-xs text-ink-700">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span>Net Worth (40%)</span>
                    <span className="font-mono text-ink-800">{(score.net_worth_score ?? 0).toFixed(1)}</span>
                  </div>
                  <ScoreBar value={score.net_worth_score ?? 0} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span>Portfolio (30%)</span>
                    <span className="font-mono text-ink-800">{(score.portfolio_quality_score ?? 0).toFixed(1)}</span>
                  </div>
                  <ScoreBar value={score.portfolio_quality_score ?? 0} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span>Reserves (30%)</span>
                    <span className="font-mono text-ink-800">{(score.reserve_health_score ?? 0).toFixed(1)}</span>
                  </div>
                  <ScoreBar value={score.reserve_health_score ?? 0} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
