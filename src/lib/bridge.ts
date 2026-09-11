import type { LisDiscordBridge } from '../../shared/ipc'
import { useUiStore } from '../store/ui'
import { demoBridge } from './demoData'

/**
 * A app fala sempre com `bridge`, nunca diretamente com `window.lisdiscord`.
 * Isto escolhe, a cada chamada, entre o IPC real (dentro do Electron, com um
 * bot ligado) e os dados fictícios do modo demonstração — o que permite
 * correr e testar a interface inteira só no browser (`npm run dev` do Vite),
 * sem Electron nem token nenhum.
 */
function active(): LisDiscordBridge {
  const demoMode = useUiStore.getState().demoMode
  if (!demoMode && window.lisdiscord) return window.lisdiscord
  return demoBridge
}

type BridgeMethod = keyof LisDiscordBridge

export const bridge: LisDiscordBridge = new Proxy({} as LisDiscordBridge, {
  get(_target, prop: BridgeMethod) {
    return (...args: unknown[]) => {
      const fn = active()[prop] as (...a: unknown[]) => unknown
      return fn(...args)
    }
  },
})

export function isRealBridgeAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.lisdiscord)
}
