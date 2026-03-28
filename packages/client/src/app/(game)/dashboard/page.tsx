'use client';
import { usePlayerStore } from '../../../store/player-store';
import { useWorldStore } from '../../../store/world-store';
import { MIN_RESERVE_RATIO } from '@argentum/shared';
import BalanceSheetCharts from '../../../components/BalanceSheetCharts';
import MarketCoverageCharts from '../../../components/MarketCoverageCharts';

function Gold({ amount }: { amount: number }) {
  let formatted: string;
  if (amount >= 1_000_000) {
    formatted = `${(amount / 1_000_000).toFixed(1)}M`;
  } else if (amount >= 1_000) {
    formatted = amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } else {
    formatted = amount.toFixed(0);
  }
  return <span className="font-mono text-gold-400">{formatted}</span>;
}

function Row({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`flex justify-between py-2 border-b border-parch-200 ${highlight ? 'text-danger-400' : ''}`}>
      <span className="text-ink-700 text-sm">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function DashboardPage() {
  const player   = usePlayerStore(s => s.player);
  const bs       = usePlayerStore(s => s.balanceSheet);
  const loans    = usePlayerStore(s => s.loans);
  const deps     = usePlayerStore(s => s.deposits);
  const licenses = usePlayerStore(s => s.licenses);
  const history           = usePlayerStore(s => s.history);
  const townTotalDeposits = usePlayerStore(s => s.townTotalDeposits);
  const clock    = useWorldStore(s => s.clock);
  const getTown  = useWorldStore(s => s.getTown);

  if (!player || !bs) {
    return (
      <div className="p-8 text-ink-700">Connecting to the world...</div>
    );
  }

  const reserveLow = bs.reserve_ratio < MIN_RESERVE_RATIO;
  const activeLoans = loans.filter(l => l.status === 'active');
  const defaultedCount = loans.filter(l => l.status === 'defaulted').length;
  const totalDeposits = deps.reduce((acc, d) => acc + d.balance, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gold-400">{player.bank_name}</h2>
          <p className="text-ink-700 text-sm">
            {player.username} •{' '}
            {clock && `${clock.current_season.charAt(0).toUpperCase() + clock.current_season.slice(1)}, Year ${clock.current_year}, Tick ${clock.current_tick}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-700">Reputation</p>
          <div className="flex items-center gap-1 justify-end">
            <div className="h-2 w-20 bg-parch-300 rounded overflow-hidden">
              <div className="h-full bg-gold-400" style={{ width: `${player.reputation}%` }} />
            </div>
            <span className="text-xs text-gold-400">{player.reputation.toFixed(0)}</span>
          </div>
        </div>
      </div>

      {reserveLow && (
        <div className="bg-danger-500 border border-danger-400 rounded p-3 mb-4 text-sm text-parch-50">
          ⚠ Reserve ratio critical ({(bs.reserve_ratio * 100).toFixed(1)}%) — minimum is {(MIN_RESERVE_RATIO * 100).toFixed(0)}%.
          Citizens may begin withdrawing deposits.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Assets */}
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
          <h3 className="text-gold-400 font-semibold mb-3">Assets</h3>
          <Row label="Cash Reserves"    value={<Gold amount={bs.cash} />} />
          <Row label="Active Loans"     value={<Gold amount={bs.total_loan_book} />} />
          <div className="flex justify-between py-2 mt-1 font-bold">
            <span className="text-ink-800">Total Assets</span>
            <Gold amount={bs.cash + bs.total_loan_book} />
          </div>
        </div>

        {/* Liabilities & Equity */}
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
          <h3 className="text-gold-400 font-semibold mb-3">Liabilities & Equity</h3>
          <Row label="Deposits Owed"     value={<Gold amount={bs.total_deposits_owed} />} />
          <Row label="Interest Accrued"  value={<Gold amount={bs.total_interest_accrued} />} />
          <div className="flex justify-between py-2 mt-1 font-bold">
            <span className="text-ink-800">Net Equity</span>
            <span className={bs.equity >= 0 ? 'text-safe-400 font-mono' : 'text-danger-400 font-mono'}>
              {bs.equity >= 0 ? '' : '-'}{Math.abs(bs.equity).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        {/* Portfolio */}
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
          <h3 className="text-gold-400 font-semibold mb-3">Portfolio</h3>
          <Row label="Active Loans"      value={<span className="font-mono text-ink-800">{activeLoans.length}</span>} />
          <Row label="Defaulted Loans"   value={<span className={`font-mono ${defaultedCount > 0 ? 'text-danger-400' : 'text-ink-800'}`}>{defaultedCount}</span>} />
          <Row label="Deposit Positions" value={<span className="font-mono text-ink-800">{deps.filter(d => d.balance > 0).length}</span>} />
          <Row label="Total Deposits"    value={<Gold amount={totalDeposits} />} />
        </div>

        {/* Ratios */}
        <div className="bg-parch-50 border border-parch-300 rounded-lg p-4">
          <h3 className="text-gold-400 font-semibold mb-3">Key Ratios</h3>
          <Row
            label="Reserve Ratio"
            value={<span className={reserveLow ? 'text-danger-400 font-mono' : 'text-safe-400 font-mono'}>{(bs.reserve_ratio * 100).toFixed(1)}%</span>}
            highlight={reserveLow}
          />
          <Row
            label="Equity / Assets"
            value={
              <span className="font-mono text-ink-800">
                {bs.total_loan_book + bs.cash > 0
                  ? ((bs.equity / (bs.cash + bs.total_loan_book)) * 100).toFixed(1) + '%'
                  : '—'}
              </span>
            }
          />
          <Row
            label="Loan Book / Assets"
            value={
              <span className="font-mono text-ink-800">
                {bs.cash + bs.total_loan_book > 0
                  ? ((bs.total_loan_book / (bs.cash + bs.total_loan_book)) * 100).toFixed(1) + '%'
                  : '—'}
              </span>
            }
          />
        </div>
      </div>

      {/* Market Coverage */}
      <div className="mt-6">
        <h3 className="text-gold-400 font-semibold mb-4">Market Coverage</h3>
        <MarketCoverageCharts licenses={licenses} deposits={deps} getTown={getTown} townTotalDeposits={townTotalDeposits} />
      </div>

      {/* Historical Charts */}
      <div className="mt-6">
        <h3 className="text-gold-400 font-semibold mb-4">Historical Charts</h3>
        <BalanceSheetCharts history={history} />
      </div>

      {/* Active Loans Table */}
      {activeLoans.length > 0 && (
        <div className="mt-6 bg-parch-50 border border-parch-300 rounded-lg p-4">
          <h3 className="text-gold-400 font-semibold mb-3">Active Loans ({activeLoans.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-700 border-b border-parch-300">
                  <th className="text-left pb-2">Borrower</th>
                  <th className="text-left pb-2">Town</th>
                  <th className="text-right pb-2">Balance</th>
                  <th className="text-right pb-2">Rate</th>
                  <th className="text-right pb-2">Progress</th>
                  <th className="text-right pb-2">Default Risk</th>
                </tr>
              </thead>
              <tbody>
                {activeLoans.map(loan => {
                  const progress = Math.round((loan.ticks_elapsed / loan.term_ticks) * 100);
                  const riskPct  = (loan.default_probability_per_tick * 360 * 100).toFixed(1);
                  return (
                    <tr key={loan.id} className="border-b border-parch-200 hover:bg-parch-100">
                      <td className="py-2">{loan.borrower_name}</td>
                      <td className="py-2 text-ink-700">{loan.town_id.replace('town_', '')}</td>
                      <td className="py-2 text-right"><Gold amount={loan.outstanding_balance} /></td>
                      <td className="py-2 text-right font-mono">{(loan.interest_rate * 100).toFixed(1)}%</td>
                      <td className="py-2 text-right font-mono">{progress}%</td>
                      <td className={`py-2 text-right font-mono ${parseFloat(riskPct) > 20 ? 'text-danger-400' : 'text-ink-700'}`}>
                        ~{riskPct}%/yr
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
