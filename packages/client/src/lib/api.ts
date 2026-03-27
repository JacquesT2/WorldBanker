const SERVER_URL = process.env['NEXT_PUBLIC_SERVER_URL'] ?? 'http://localhost:3001';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('argentum_token');
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${SERVER_URL}/api${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    register: (data: { username: string; password: string; bank_name: string; starting_town_id: string }) =>
      apiFetch<{ token: string; player_id: string; bank_name: string; starting_town_id: string }>(
        '/auth/register', { method: 'POST', body: JSON.stringify(data) }
      ),
    login: (data: { username: string; password: string }) =>
      apiFetch<{ token: string; player_id: string; is_bankrupt: boolean }>(
        '/auth/login', { method: 'POST', body: JSON.stringify(data) }
      ),
  },
  world: {
    snapshot: () => apiFetch<unknown>('/world/state'),
    towns: () => apiFetch<unknown[]>('/world/towns'),
    town: (id: string) => apiFetch<unknown>(`/world/towns/${id}`),
  },
  loans: {
    queue: () => apiFetch<unknown[]>('/loans/queue'),
    accept: (proposalId: string, offered_rate: number) =>
      apiFetch<{ loan_id: string }>(`/loans/${proposalId}/accept`, {
        method: 'POST',
        body: JSON.stringify({ offered_rate }),
      }),
    reject: (proposalId: string) =>
      apiFetch<{ success: boolean }>(`/loans/${proposalId}/reject`, { method: 'POST' }),
  },
  deposits: {
    setRate: (town_id: string, rate: number) =>
      apiFetch<{ success: boolean }>('/deposits/set-rate', {
        method: 'POST',
        body: JSON.stringify({ town_id, rate }),
      }),
  },
  licenses: {
    mine: () => apiFetch<unknown[]>('/licenses'),
    market: () => apiFetch<unknown[]>('/licenses/market'),
    purchase: (town_id: string) =>
      apiFetch<{ license_id: string; cost: number }>('/licenses/purchase', {
        method: 'POST',
        body: JSON.stringify({ town_id }),
      }),
  },
  investments: {
    mine: () => apiFetch<unknown[]>('/investments'),
    invest: (town_id: string, sector_type: string, amount: number) =>
      apiFetch<{ investment_id: string }>('/investments/sector', {
        method: 'POST',
        body: JSON.stringify({ town_id, sector_type, amount }),
      }),
  },
  leaderboard: {
    get: () => apiFetch<{ scores: unknown[]; tick: number; season: string; year: number }>('/leaderboard'),
  },
};
