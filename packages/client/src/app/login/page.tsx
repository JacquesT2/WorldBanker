'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { saveAuth } from '../../lib/auth';
import { connectSocket } from '../../lib/socket';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: '', password: '', bank_name: '', starting_town_id: 'town_aurea' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const CAPITAL_TOWNS = [
    { id: 'town_aurea', name: 'Aurea (Aurean Coast)' },
    { id: 'town_ferrath', name: 'Ferrath (Valdris Delta)' },
    { id: 'town_skarhold', name: 'Skarhold (Ironspine Mountains)' },
    { id: 'town_sylvenmere', name: 'Sylvenmere (Thornwood)' },
    { id: 'town_yarim', name: 'Yarim (Dustplains)' },
    { id: 'town_ashgate', name: 'Ashgate (Caldera Reach)' },
    { id: 'town_corsair_haven', name: 'Corsair Haven (Shattered Isles)' },
    { id: 'town_midmark_city', name: 'Midmark City (The Midmark)' },
    { id: 'town_brineholt', name: 'Brineholt (Saltmarsh)' },
    { id: 'town_greystone', name: 'Greystone (Greyhaven Plateau)' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let token: string;
      let player_id: string;

      if (tab === 'login') {
        const res = await api.auth.login({ username: form.username, password: form.password });
        token = res.token;
        player_id = res.player_id;
      } else {
        const res = await api.auth.register({
          username: form.username,
          password: form.password,
          bank_name: form.bank_name,
          starting_town_id: form.starting_town_id,
        });
        token = res.token;
        player_id = res.player_id;
      }

      saveAuth(token, player_id);
      connectSocket(token);
      router.push('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold text-gold-400 text-center mb-2">Argentum</h1>
        <p className="text-parch-200 text-center mb-8 text-sm">Medieval Banking Simulator</p>

        <div className="bg-ink-700 border border-gold-600 rounded-lg p-6">
          <div className="flex mb-6">
            {(['login', 'register'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  tab === t
                    ? 'text-gold-400 border-b-2 border-gold-400'
                    : 'text-parch-200 border-b border-ink-700 hover:text-parch-100'
                }`}
              >
                {t === 'login' ? 'Sign In' : 'Found a Banking House'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-parch-200 mb-1">Username</label>
              <input
                type="text"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                className="w-full bg-ink-800 border border-gold-600 rounded px-3 py-2 text-parch-100 focus:outline-none focus:border-gold-400"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-parch-200 mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full bg-ink-800 border border-gold-600 rounded px-3 py-2 text-parch-100 focus:outline-none focus:border-gold-400"
                required
              />
            </div>

            {tab === 'register' && (
              <>
                <div>
                  <label className="block text-sm text-parch-200 mb-1">Banking House Name</label>
                  <input
                    type="text"
                    value={form.bank_name}
                    onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                    className="w-full bg-ink-800 border border-gold-600 rounded px-3 py-2 text-parch-100 focus:outline-none focus:border-gold-400"
                    required
                    placeholder="e.g. House Valdren"
                  />
                </div>

                <div>
                  <label className="block text-sm text-parch-200 mb-1">Starting City (free license)</label>
                  <select
                    value={form.starting_town_id}
                    onChange={e => setForm(f => ({ ...f, starting_town_id: e.target.value }))}
                    className="w-full bg-ink-800 border border-gold-600 rounded px-3 py-2 text-parch-100 focus:outline-none focus:border-gold-400"
                  >
                    {CAPITAL_TOWNS.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {error && (
              <p className="text-danger-400 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold-500 hover:bg-gold-400 text-ink-800 font-bold py-2 rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Please wait...' : tab === 'login' ? 'Enter the Market' : 'Found Your House'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
