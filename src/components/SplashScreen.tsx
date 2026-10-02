import { LogoMark, Wordmark } from './brand'
import { TitleBar } from './TitleBar'

// Ecrã de arranque — o mesmo desenho da imagem de apresentação do LisDiscord: os arcos finos, o logo
// num quadrado escuro, "LisDiscord" com o "Discord" em gradiente e os três pontos (verde, branco, ciano).

/** Arcos concêntricos discretos atrás do conteúdo. */
export function BrandArcs() {
  return (
    <svg className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[70%] w-full max-w-[1400px] opacity-60" viewBox="0 0 1600 700" preserveAspectRatio="xMidYMin meet" aria-hidden>
      <path d="M90 320 C 160 -40 1440 -40 1510 320" fill="none" stroke="#1f2a2a" strokeWidth="1.2" />
      <path d="M160 400 C 240 -10 1360 -10 1440 400" fill="none" stroke="#1a2324" strokeWidth="1.2" />
    </svg>
  )
}

export function LoadingDots() {
  return (
    <div className="flex items-center gap-3">
      {['bg-accent', 'bg-text', 'bg-cyan'].map((c, i) => (
        <span key={c} className={`size-2 rounded-full ${c} animate-pulse-dot`} style={{ animationDelay: `${i * 0.2}s`, color: 'transparent' }} />
      ))}
    </div>
  )
}

export function SplashScreen() {
  return (
    <div className="app-backdrop flex h-screen flex-col overflow-hidden">
      <TitleBar shell={false} />
      <div className="relative flex flex-1 flex-col items-center justify-center">
        <BrandArcs />
        <div className="relative flex animate-pop flex-col items-center">
          <div className="flex size-48 items-center justify-center rounded-[44px] bg-[#0d0f12] shadow-[0_30px_80px_rgb(0_0_0/0.5)]">
            <LogoMark size={140} plain />
          </div>
          <Wordmark className="mt-10 text-6xl" />
          <div className="mt-8 h-px w-64 bg-gradient-to-r from-transparent via-cyan/30 to-transparent" />
          <div className="mt-6">
            <LoadingDots />
          </div>
        </div>
      </div>
    </div>
  )
}
