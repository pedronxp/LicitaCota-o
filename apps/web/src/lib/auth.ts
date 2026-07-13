'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Usuario } from '@/types/api';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  usuario: Usuario | null;
  hasHydrated: boolean;
  setTokens: (access: string, refresh: string) => void;
  setUsuario: (u: Usuario) => void;
  logout: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      usuario: null,
      hasHydrated: false,
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setUsuario: (usuario) => set({ usuario }),
      logout: () => set({ accessToken: null, refreshToken: null, usuario: null }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    }),
    {
      name: 'licitapreco-auth',
      partialize: (s) => ({ refreshToken: s.refreshToken, usuario: s.usuario }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);
