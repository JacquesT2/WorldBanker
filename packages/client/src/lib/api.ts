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
      apiFetch<{ loan_id: string; loan: import('@argentum/shared').Loan }>(`/loans/${proposalId}/accept`, {
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
  companies: {
    list: () => apiFetch<unknown[]>('/companies'),
    get: (id: string) => apiFetch<unknown>(`/companies/${id}`),
    byTown: (townId: string) => apiFetch<unknown[]>(`/companies/town/${townId}`),
    orphanedAssets: () => apiFetch<unknown[]>('/companies/assets/orphaned'),
  },
  leaderboard: {
    get: () => apiFetch<{ scores: unknown[]; tick: number; season: string; year: number }>('/leaderboard'),
  },
  autoBid: {
    getRule: () => apiFetch<import('@argentum/shared').AutoBidRule>('/auto-bid/rule'),
    setRule: (rule: Partial<import('@argentum/shared').AutoBidRule>) =>
      apiFetch<import('@argentum/shared').AutoBidRule>('/auto-bid/rule', {
        method: 'PUT',
        body: JSON.stringify(rule),
      }),
  },
  dev: {
    status:   () => apiFetch<{ running: boolean; paused: boolean; speedMultiplier: number; tick: number }>('/dev/status'),
    pause:    () => apiFetch<{ paused: boolean }>('/dev/pause', { method: 'POST' }),
    resume:   () => apiFetch<{ paused: boolean }>('/dev/resume', { method: 'POST' }),
    setSpeed: (multiplier: number) => apiFetch<{ speedMultiplier: number }>('/dev/set-speed', { method: 'POST', body: JSON.stringify({ multiplier }) }),
    reset:    () => apiFetch<{ ok: boolean }>('/dev/reset', { method: 'POST' }),
  },
};
