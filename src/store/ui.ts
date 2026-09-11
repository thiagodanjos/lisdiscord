import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  demoMode: boolean
  setDemoMode: (value: boolean) => void
}

const startsInBrowser = typeof window !== 'undefined' && !window.lisdiscord

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      demoMode: startsInBrowser,
      setDemoMode: (value) => set({ demoMode: value }),
    }),
    { name: 'lisdiscord-ui' },
  ),
)
