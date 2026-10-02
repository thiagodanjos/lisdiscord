import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, PanelLeft, Search } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { cn } from '../lib/utils'
import { useUiStore } from '../store/ui'
import { LogoMark } from './brand'
import { Modal, PulseDot } from './ui'
import { CREDIT_HANDLE } from '../../shared/branding'
import type { WindowAction } from '../../shared/ipc'
import pkg from '../../package.json'

// Barra de título própria: a janela não tem a barra do Windows — os botões minimizar/maximizar/fechar
// nativos ficam por cima, à direita (titleBarOverlay), e o resto da barra arrasta a janela.

interface MenuEntry {
  label: string
  shortcut?: string
  run: () => void
  separatorBefore?: boolean
}

function MenuButton({ label, entries, open, onOpen, onClose }: { label: string; entries: MenuEntry[]; open: boolean; onOpen: () => void; onClose: () => void }) {
  return (
    <div className="no-drag relative">
      <button
        type="button"
        onClick={() => (open ? onClose() : onOpen())}
        onMouseEnter={() => {
          // Com um menu já aberto, passar o rato muda de menu (como nas apps nativas).
          if (!open && document.querySelector('[data-titlebar-menu-open="true"]')) onOpen()
        }}
        className={cn('rounded-md px-2.5 py-1 text-[13px] text-muted transition-colors hover:bg-white/[0.06] hover:text-text', open && 'bg-white/[0.08] text-text')}
      >
        {label}
      </button>
      {open && (
        <div data-titlebar-menu-open="true" className="absolute top-full left-0 z-[60] mt-1 min-w-56 animate-pop rounded-xl border border-border bg-raised p-1 shadow-2xl">
          {entries.map((e) => (
            <div key={e.label}>
              {e.separatorBefore && <div className="my-1 h-px bg-border" />}
              <button
                type="button"
                onClick={() => {
                  onClose()
                  e.run()
                }}
                className="flex w-full items-center justify-between gap-6 rounded-lg px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/[0.06]"
              >
                <span>{e.label}</span>
                {e.shortcut && <span className="font-mono text-[11px] text-faint">{e.shortcut}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TitleBar({ shell, status }: { shell: boolean; status?: { label: string; tone: 'ok' | 'remote' | 'off' | 'demo' } }) {
  const navigate = useNavigate()
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const [platform, setPlatform] = useState('win32')
  const [menu, setMenu] = useState<string | null>(null)
  const [about, setAbout] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const act = (a: WindowAction) => void bridge.windowAction(a)

  useEffect(() => {
    bridge
      .getPlatform()
      .then(setPlatform)
      .catch(() => undefined)
  }, [])

  // Fecha o menu ao clicar fora.
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  // Atalhos globais.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k' && shell) {
        e.preventDefault()
        setPaletteOpen(true)
      } else if (mod && e.key.toLowerCase() === 'b' && shell) {
        e.preventDefault()
        toggleSidebar()
      } else if (e.key === 'F11') {
        e.preventDefault()
        act('fullscreen')
      } else if (e.altKey && e.key === 'ArrowLeft' && shell) {
        navigate(-1)
      } else if (e.altKey && e.key === 'ArrowRight' && shell) {
        navigate(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell])

  const menus: Record<string, MenuEntry[]> = {
    Ficheiro: [
      ...(shell
        ? [
            { label: 'Nova atividade na agenda', run: () => navigate('/agenda') },
            { label: 'Nova mensagem / embed', run: () => navigate('/mensagens') },
            { label: 'Definições', shortcut: 'Ctrl+,', run: () => navigate('/definicoes'), separatorBefore: true },
          ]
        : []),
      { label: 'Recarregar', shortcut: 'Ctrl+R', run: () => act('reload'), separatorBefore: shell },
      { label: 'Sair', shortcut: 'Alt+F4', run: () => act('quit') },
    ],
    Editar: [
      { label: 'Desfazer', shortcut: 'Ctrl+Z', run: () => act('undo') },
      { label: 'Refazer', shortcut: 'Ctrl+Y', run: () => act('redo') },
      { label: 'Cortar', shortcut: 'Ctrl+X', run: () => act('cut'), separatorBefore: true },
      { label: 'Copiar', shortcut: 'Ctrl+C', run: () => act('copy') },
      { label: 'Colar', shortcut: 'Ctrl+V', run: () => act('paste') },
      { label: 'Selecionar tudo', shortcut: 'Ctrl+A', run: () => act('selectAll') },
    ],
    Ver: [
      ...(shell
        ? [
            { label: 'Pesquisa rápida', shortcut: 'Ctrl+K', run: () => setPaletteOpen(true) },
            { label: 'Mostrar/esconder barra lateral', shortcut: 'Ctrl+B', run: toggleSidebar },
          ]
        : []),
      { label: 'Aumentar zoom', shortcut: 'Ctrl+=', run: () => act('zoomIn'), separatorBefore: shell },
      { label: 'Diminuir zoom', shortcut: 'Ctrl+-', run: () => act('zoomOut') },
      { label: 'Tamanho normal', shortcut: 'Ctrl+0', run: () => act('zoomReset') },
      { label: 'Ecrã inteiro', shortcut: 'F11', run: () => act('fullscreen'), separatorBefore: true },
      { label: 'Ferramentas de programador', shortcut: 'Ctrl+Shift+I', run: () => act('devtools') },
    ],
    Ajuda: [
      ...(shell ? [{ label: 'Abrir a aba LisFilms', run: () => navigate('/lisfilms') }] : []),
      { label: 'Abrir lisfilms.pt', run: () => window.open('https://lisfilms.pt', '_blank') },
      { label: 'Sobre o LisDiscord', run: () => setAbout(true), separatorBefore: true },
    ],
  }

  const mac = platform === 'darwin'
  const dot = { ok: 'text-accent', remote: 'text-cyan', off: 'text-danger', demo: 'text-warning' }

  return (
    <>
      <div
        ref={ref}
        className={cn('drag relative z-50 flex h-10 shrink-0 items-center gap-1 bg-bg', mac ? 'pr-3 pl-[78px]' : 'pr-[148px] pl-3')}
        onDoubleClick={(e) => {
          if (e.target === e.currentTarget) act('maximize')
        }}
      >
        <div className="no-drag mr-1 flex items-center">
          <LogoMark size={22} plain />
        </div>
        {!mac &&
          Object.entries(menus).map(([label, entries]) => (
            <MenuButton key={label} label={label} entries={entries} open={menu === label} onOpen={() => setMenu(label)} onClose={() => setMenu(null)} />
          ))}
        {shell && (
          <div className="no-drag ml-2 flex items-center gap-0.5">
            <button type="button" title="Mostrar/esconder barra lateral (Ctrl+B)" onClick={toggleSidebar} className="rounded-md p-1.5 text-faint hover:bg-white/[0.06] hover:text-text">
              <PanelLeft size={15} />
            </button>
            <button type="button" title="Voltar (Alt+←)" onClick={() => navigate(-1)} className="rounded-md p-1.5 text-faint hover:bg-white/[0.06] hover:text-text">
              <ArrowLeft size={15} />
            </button>
            <button type="button" title="Avançar (Alt+→)" onClick={() => navigate(1)} className="rounded-md p-1.5 text-faint hover:bg-white/[0.06] hover:text-text">
              <ArrowRight size={15} />
            </button>
          </div>
        )}

        {shell && (
          <div className="pointer-events-none absolute inset-x-0 flex justify-center">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="no-drag pointer-events-auto flex w-[min(420px,40vw)] items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-1 text-[13px] text-faint transition-colors hover:border-border-strong hover:text-muted"
            >
              <Search size={13} />
              <span className="flex-1 text-left">Pesquisar páginas e ações…</span>
              <kbd className="rounded border border-border px-1.5 font-mono text-[10px]">Ctrl K</kbd>
            </button>
          </div>
        )}

        <div className="flex-1" />
        {status && (
          <span className={cn('no-drag flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', dot[status.tone])}>
            <PulseDot />
            <span className="text-muted">{status.label}</span>
          </span>
        )}
      </div>

      <Modal open={about} onClose={() => setAbout(false)} title="Sobre o LisDiscord">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <LogoMark size={72} />
          <p className="text-xl font-extrabold">
            <span className="text-text">Lis</span>
            <span className="text-brand-gradient">Discord</span>
          </p>
          <p className="font-mono text-xs text-faint">v{pkg.version}</p>
          <p className="max-w-xs text-sm text-muted">O painel do teu bot da Discord — da família LisFilms.</p>
          <p className="text-xs text-faint">
            Created by <span className="text-brand-gradient font-semibold">{CREDIT_HANDLE}</span>
          </p>
        </div>
      </Modal>
    </>
  )
}
