import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  demoMode: boolean
  setDemoMode: (value: boolean) => void
  /** Barra lateral compacta (só ícones). */
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  /** Últimas páginas abertas (para "Recentes" e a pesquisa rápida). */
  recent: string[]
  pushRecent: (path: string) => void
  /** Pesquisa rápida (Ctrl+K) aberta. */
  paletteOpen: boolean
  setPaletteOpen: (value: boolean) => void
}

const startsInBrowser = typeof window !== 'undefined' && !window.lisdiscord

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      demoMode: startsInBrowser,
      setDemoMode: (value) => set({ demoMode: value }),
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      recent: [],
      pushRecent: (path) => set((s) => ({ recent: [path, ...s.recent.filter((p) => p !== path)].slice(0, 6) })),
      paletteOpen: false,
      setPaletteOpen: (value) => set({ paletteOpen: value }),
    }),
    {
      name: 'lisdiscord-ui',
      // A pesquisa aberta não fica guardada entre arranques.
      partialize: (s) => ({ demoMode: s.demoMode, sidebarCollapsed: s.sidebarCollapsed, recent: s.recent }),
    },
  ),
)
