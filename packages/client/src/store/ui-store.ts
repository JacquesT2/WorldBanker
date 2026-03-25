'use client';
import { create } from 'zustand';

interface Notification {
  id: string;
  type: 'default' | 'warning' | 'danger';
  message: string;
  timestamp: number;
}

interface UiStore {
  selectedTownId: string | null;
  notifications: Notification[];
  sidebarCollapsed: boolean;

  selectTown: (id: string | null) => void;
  addNotification: (message: string, type?: Notification['type']) => void;
  dismissNotification: (id: string) => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  selectedTownId: null,
  notifications: [],
  sidebarCollapsed: false,

  selectTown: (id) => set({ selectedTownId: id }),

  addNotification: (message, type = 'default') => {
    const notification: Notification = {
      id: Math.random().toString(36).slice(2),
      type,
      message,
      timestamp: Date.now(),
    };
    set(s => ({ notifications: [notification, ...s.notifications].slice(0, 50) }));
  },

  dismissNotification: (id) => set(s => ({
    notifications: s.notifications.filter(n => n.id !== id),
  })),

  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
