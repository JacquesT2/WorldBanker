'use client';

const TOKEN_KEY = 'argentum_token';
const PLAYER_KEY = 'argentum_player_id';

export function saveAuth(token: string, playerId: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(PLAYER_KEY, playerId);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PLAYER_KEY);
}

export function getStoredToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}

export function getStoredPlayerId(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(PLAYER_KEY) : null;
}

export function isAuthenticated(): boolean {
  return !!getStoredToken();
}
