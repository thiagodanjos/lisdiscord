import { useEffect, useState } from 'react'
import { Activity, ExternalLink, Film, Gamepad2, Link2, Palette, Play, Plug, Radio, Save, Search, Settings2, Sparkles, Terminal, Tv, Users } from 'lucide-react'
import { bridge } from '../lib/bridge'
import { cleanIpcError } from '../lib/errors'
import { Badge, Button, Card, Toggle } from '../components/ui'
import { LisFilmsMark, LisFilmsWordmark, LogoMark, Wordmark } from '../components/brand'
import { TemplateEditorModal } from '../components/TemplateEditorModal'
import { EmojiTextInput } from '../components/EmojiTextInput'
import { DiscordButtonPreview } from '../components/DiscordButtonEditor'
import { MEDIA_EMOJI, MEDIA_LABEL, defaultLisFilmsSettings, stars } from '../../shared/lisfilms'
import {
  LISFILMS_GAME_PLACEHOLDERS,
  LISFILMS_LIST_PLACEHOLDERS,
  LISFILMS_SUMMARY_PLACEHOLDERS,
  LISFILMS_TITLE_PLACEHOLDERS,
  type BotEmoji,
  type EmbedTemplateKind,
  type GuildSummary,
  type LisFilmsHit,
  type LisFilmsSettings,
  type LisFilmsStatus,
  type RemoteBotConfig,
} from '../../shared/types'

const EMPTY_REMOTE_CONFIG: RemoteBotConfig = { url: null, hasApiKey: false }
const inputClass = 'w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

const COMMANDS: { key: keyof LisFilmsSettings['commands']; usage: string; text: string }[] = [
  { key: 'procurar', usage: '/lisfilms procurar termo: [tipo]', text: 'Procura filmes, séries, animes, jogos e pessoas — com um menu para abrir cada resultado.' },
  { key: 'titulo', usage: '/lisfilms filme | serie | anime titulo:', text: 'Ficha com poster, sinopse, nota da comunidade LisFilms e da TMDB (com autocompletar).' },
  { key: 'jogo', usage: '/lisfilms jogo nome:', text: 'Ficha do LisGames: capa, plataformas, Metacritic, duração e a nota da casa.' },
  { key: 'top', usage: '/lisfilms top', text: 'O que está em alta no site (reviews, watchlists e gostos).' },
  { key: 'resumo', usage: '/lisfilms resumo', text: 'O LisFilms em números e quem mais avalia.' },
  { key: 'destaque', usage: '/lisfilms destaque', text: 'O destaque escolhido para a página inicial do site.' },
  { key: 'utilizador', usage: '/lisfilms utilizador nome:', text: 'Encontra uma pessoa e abre o perfil no site.' },
]

const TEMPLATES: { kind: EmbedTemplateKind; title: string; hint: string; tokens: readonly string[]; values: Record<string, string> }[] = [
  {
    kind: 'lisfilmsTitle',
    title: 'Ficha de filme / série / anime',
    hint: 'Resposta do /lisfilms filme, serie e anime (e do menu das pesquisas). {poster} é o poster da TMDB; {estrelas} desenha a nota (★★★★☆).',
    tokens: LISFILMS_TITLE_PLACEHOLDERS,
    values: {
      titulo: 'Interstellar',
      tipo: '🎬 Filme',
      ano: '2014',
      genero: 'Ficção científica',
      sinopse: 'Um grupo de exploradores viaja através de um buraco de minhoca no espaço para garantir a sobrevivência da humanidade.',
      notaLisFilms: '4.6/5',
      estrelas: stars(4.6),
      avaliacoes: '87',
      notaTmdb: '8.4/10',
      poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
      link: 'https://lisfilms.pt/movies/1',
    },
  },
  {
    kind: 'lisfilmsGame',
    title: 'Ficha de jogo (LisGames)',
    hint: 'Resposta do /lisfilms jogo. {capa} é a imagem do jogo (larga, fica bem em baixo).',
    tokens: LISFILMS_GAME_PLACEHOLDERS,
    values: {
      nome: 'Grand Theft Auto V',
      ano: '2013',
      lancamento: '2013-09-17',
      generos: 'Action, Adventure',
      plataformas: 'PC, PlayStation 5, Xbox Series S/X',
      estudio: 'Rockstar North',
      editora: 'Rockstar Games',
      metacritic: '92',
      duracao: '74h',
      notaLisGames: '4.4/5',
      estrelas: stars(4.4),
      avaliacoes: '31',
      sinopse: 'Los Santos, três criminosos muito diferentes e um golpe atrás do outro.',
      capa: '',
      link: 'https://lisfilms.pt/jogos/3498',
    },
  },
  {
    kind: 'lisfilmsList',
    title: 'Listas (procurar, top, utilizadores)',
    hint: '{lista} = os resultados, já com links para o site; {termo} = o que a pessoa procurou.',
    tokens: LISFILMS_LIST_PLACEHOLDERS,
    values: {
      titulo: '🔎 “batman” no LisFilms',
      lista: '**1.** 🎬 [The Batman](https://lisfilms.pt) — 2022 · Ação\n**2.** 🎬 [Batman Begins](https://lisfilms.pt) — 2005 · Ação\n**3.** 🎮 [Batman: Arkham Knight](https://lisfilms.pt) — 2015',
      total: '3',
      termo: 'batman',
      link: 'https://lisfilms.pt',
    },
  },
  {
    kind: 'lisfilmsSummary',
    title: 'Resumo do LisFilms',
    hint: 'Resposta do /lisfilms resumo — números do site, em alta e quem mais avalia.',
    tokens: LISFILMS_SUMMARY_PLACEHOLDERS,
    values: {
      filmes: '1284',
      series: '356',
      reviews: '4120',
      utilizadores: '218',
      media: '3.9/5',
      emAlta: '**1.** 🎬 Interstellar (2014)\n**2.** 📺 Breaking Bad (2008)',
      topUtilizadores: '**1.** Thiago — 312 reviews · média 4.1',
      link: 'https://lisfilms.pt',
    },
  },
]

function SectionTitle({ icon: Icon, title, subtitle, action }: { icon: typeof Film; title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon size={17} />
        </div>
        <div>
          <h3 className="text-sm font-black tracking-wide uppercase">{title}</h3>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
      </div>
      {action}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">{children}</label>
}

export default function LisFilms() {
  const [remoteConfig, setRemoteConfig] = useState<RemoteBotConfig>(EMPTY_REMOTE_CONFIG)
  const [settings, setSettings] = useState<LisFilmsSettings>(defaultLisFilmsSettings())
  const [draft, setDraft] = useState<LisFilmsSettings>(defaultLisFilmsSettings())
  const [status, setStatus] = useState<LisFilmsStatus | null>(null)
  const [testing, setTesting] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<LisFilmsHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [guilds, setGuilds] = useState<GuildSummary[]>([])
  const [guildId, setGuildId] = useState('')
  const [emojis, setEmojis] = useState<BotEmoji[]>([])
  const [editing, setEditing] = useState<(typeof TEMPLATES)[number] | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [error, setError] = useState('')
  const [videoMissing, setVideoMissing] = useState(false)

  const isRemote = Boolean(remoteConfig.url && remoteConfig.hasApiKey)
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const set = <K extends keyof LisFilmsSettings>(key: K, value: LisFilmsSettings[K]) => setDraft((d) => ({ ...d, [key]: value }))

  useEffect(() => {
    bridge.getRemoteBotConfig().then(setRemoteConfig)
  }, [])

  async function test() {
    setTesting(true)
    try {
      setStatus(await (isRemote ? bridge.testRemoteLisFilms : bridge.testLisFilms)())
    } catch (err) {
      setStatus({ ok: false, latencyMs: null, error: cleanIpcError(err) })
    } finally {
      setTesting(false)
    }
  }

  useEffect(() => {
    const get = isRemote ? bridge.getRemoteLisFilms : bridge.getLisFilms
    get()
      .then((s) => {
        setSettings(s.settings)
        setDraft(s.settings)
      })
      .catch((err) => setError(cleanIpcError(err)))
    const listGuilds = isRemote ? bridge.listRemoteGuilds : bridge.listGuilds
    listGuilds()
      .then((g) => {
        setGuilds(g)
        setGuildId(g[0]?.id ?? '')
      })
      .catch(() => setGuilds([]))
    const listEmojis = isRemote ? bridge.listRemoteEmojis : bridge.listEmojis
    listEmojis().then(setEmojis).catch(() => setEmojis([]))
    void test()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRemote])

  async function search(e?: React.FormEvent) {
    e?.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setError('')
    try {
      setHits(await (isRemote ? bridge.searchRemoteLisFilms : bridge.searchLisFilms)(query))
    } catch (err) {
      setHits([])
      setError(cleanIpcError(err))
    } finally {
      setSearching(false)
    }
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const s = await (isRemote ? bridge.setRemoteLisFilmsSettings : bridge.setLisFilmsSettings)(draft)
      setSettings(s.settings)
      setDraft(s.settings)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } catch (err) {
      setError(cleanIpcError(err))
    } finally {
      setSaving(false)
    }
  }

  const s = status?.summary

  return (
    <div className="flex flex-col gap-6">
      {/* ---- Topo ---- */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-[#0b0d10]">
        <div className="pointer-events-none absolute -top-32 left-1/3 size-[480px] rounded-full bg-accent/15 blur-[130px]" />
        <div className="pointer-events-none absolute -right-20 -bottom-40 size-[360px] rounded-full bg-accent/10 blur-[120px]" />
        <div className="relative flex flex-wrap items-center justify-between gap-6 px-10 py-10">
          <div className="flex items-center gap-5">
            <LisFilmsMark size={72} />
            <div>
              <LisFilmsWordmark className="text-5xl" />
              <p className="mt-2 text-base text-muted">A tua rede social de cinema, séries, animes e jogos</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  [Film, 'Filmes'],
                  [Tv, 'Séries'],
                  [Sparkles, 'Animes'],
                  [Gamepad2, 'Jogos'],
                ].map(([Icon, label]) => {
                  const I = Icon as typeof Film
                  return (
                    <span key={label as string} className="flex items-center gap-1.5 rounded-full border border-border bg-white/[0.03] px-3 py-1 text-xs text-text">
                      <I size={12} className="text-accent" /> {label as string}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <Button onClick={() => window.open(settings.siteUrl, '_blank')}>
              <ExternalLink size={14} /> Abrir lisfilms.pt
            </Button>
            <div className="flex items-center gap-2 text-xs text-faint">
              <LogoMark size={20} /> <Wordmark className="text-xs" /> <Link2 size={12} /> <LisFilmsMark size={20} /> <span className="font-bold text-text">LisFilms</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* ---- Vídeo ---- */}
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between px-1">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Play size={15} className="text-accent" /> Apresentação do LisFilms
            </p>
            <Badge tone="accent">Vídeo oficial</Badge>
          </div>
          {videoMissing ? (
            <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border text-sm text-faint">Vídeo de apresentação em breve.</div>
          ) : (
            <video
              className="aspect-video w-full rounded-xl bg-black"
              src="lisfilms-apresentacao.mp4"
              poster="lisfilms-banner.png"
              controls
              preload="metadata"
              onError={() => setVideoMissing(true)}
            />
          )}
          <p className="px-1 text-[11px] text-faint">Em breve: o vídeo de apresentação do LisDiscord também vai aparecer no LisFilms.</p>
        </Card>

        {/* ---- Ligação ---- */}
        <Card className="flex flex-col gap-4">
          <SectionTitle
            icon={Plug}
            title="Ligação ao site"
            subtitle={isRemote ? 'Testada a partir do bot remoto (a VPS).' : 'Testada a partir desta app.'}
            action={
              <Button variant="dark" onClick={() => void test()} loading={testing}>
                <Activity size={14} /> Testar
              </Button>
            }
          />
          {status === null ? (
            <p className="text-xs text-faint">A testar…</p>
          ) : status.ok ? (
            <Badge tone="success">
              <Radio size={11} /> Ligado · {status.latencyMs} ms
            </Badge>
          ) : (
            <div className="flex flex-col gap-1">
              <Badge tone="warning">Sem resposta</Badge>
              <p className="text-[11px] text-faint">O servidor gratuito do LisFilms dorme sem visitas e demora até ~1 min a acordar — testa outra vez. ({status.error})</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Filmes', s?.filmes],
              ['Séries', s?.series],
              ['Reviews', s?.reviews],
              ['Pessoas', s?.utilizadores],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-xl border border-border bg-black/20 px-3 py-2.5">
                <p className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">{label}</p>
                <p className="text-xl font-black text-text">{value ?? '—'}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">
            Média global da comunidade: <span className="font-bold text-text">{s?.media_global != null ? `${stars(s.media_global)} ${s.media_global}/5` : '—'}</span>
          </p>
        </Card>
      </div>

      {/* ---- Experimentar ---- */}
      <Card className="flex flex-col gap-4">
        <SectionTitle icon={Search} title="Experimentar" subtitle="O mesmo que o /lisfilms procurar faz no Discord — direto na app." />
        <form onSubmit={search} className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ex.: batman, breaking bad, gta…" className={inputClass} />
          <Button type="submit" loading={searching} disabled={!query.trim()}>
            <Search size={14} /> Procurar
          </Button>
        </form>
        {hits && hits.length === 0 && <p className="text-xs text-faint">Nada encontrado.</p>}
        {hits && hits.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {hits.slice(0, 18).map((h) => (
              <button
                key={`${h.media}-${h.id}`}
                type="button"
                onClick={() => window.open(h.url, '_blank')}
                className="group flex flex-col gap-1.5 overflow-hidden rounded-xl border border-border bg-black/20 p-2 text-left transition-colors hover:border-accent/50"
              >
                <div className="flex aspect-[2/3] items-center justify-center overflow-hidden rounded-lg bg-white/[0.03] text-3xl">
                  {h.image ? <img src={h.image} alt="" className="size-full object-cover transition-transform group-hover:scale-105" /> : MEDIA_EMOJI[h.media]}
                </div>
                <p className="truncate text-xs font-semibold text-text">{h.title}</p>
                <p className="text-[10px] text-faint">
                  {MEDIA_LABEL[h.media]}
                  {h.year ? ` · ${h.year}` : ''}
                </p>
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ---- Comandos ---- */}
        <Card className="flex flex-col gap-4">
          <SectionTitle
            icon={Terminal}
            title="Comandos no Discord"
            subtitle="Liga só os que quiseres. Guardar aplica logo no bot."
            action={
              <Button onClick={save} loading={saving} disabled={!dirty}>
                <Save size={14} /> {savedOk ? 'Guardado ✓' : 'Guardar'}
              </Button>
            }
          />
          <Toggle checked={draft.enabled} onChange={(v) => set('enabled', v)} label="/lisfilms ligado" />
          <div className={`flex flex-col gap-2 ${draft.enabled ? '' : 'pointer-events-none opacity-40'}`}>
            {COMMANDS.map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-black/20 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-accent">{c.usage}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{c.text}</p>
                </div>
                <Toggle checked={draft.commands[c.key]} onChange={(v) => set('commands', { ...draft.commands, [c.key]: v })} />
              </div>
            ))}
          </div>
          <Toggle checked={draft.ephemeral} onChange={(v) => set('ephemeral', v)} label="Respostas só para quem usou o comando" />
        </Card>

        {/* ---- Aparência ---- */}
        <Card className="flex flex-col gap-4">
          <SectionTitle icon={Settings2} title="Respostas" subtitle="Botão para o site, menu das pesquisas e textos." />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Texto do botão</Label>
              <input value={draft.linkButton.label} onChange={(e) => set('linkButton', { ...draft.linkButton, label: e.target.value })} maxLength={80} className={`mt-1.5 ${inputClass}`} />
            </div>
            <div>
              <Label>Emoji do botão</Label>
              <div className="mt-1.5">
                <EmojiTextInput value={draft.linkButton.emoji} onChange={(v) => set('linkButton', { ...draft.linkButton, emoji: v })} emojis={emojis} maxLength={100} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Toggle checked={draft.linkButton.show} onChange={(v) => set('linkButton', { ...draft.linkButton, show: v })} label="Mostrar o botão" />
            {draft.linkButton.show && <DiscordButtonPreview label={`${draft.linkButton.label || 'Ver no LisFilms'} ↗`} emoji={draft.linkButton.emoji} style="secondary" emojis={emojis} />}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_7rem]">
            <div>
              <Label>Texto do menu “abrir um resultado”</Label>
              <input value={draft.pickPlaceholder} onChange={(e) => set('pickPlaceholder', e.target.value)} maxLength={150} className={`mt-1.5 ${inputClass}`} />
            </div>
            <div>
              <Label>Resultados</Label>
              <input type="number" min={1} max={25} value={draft.resultsLimit} onChange={(e) => set('resultsLimit', Number(e.target.value))} className={`mt-1.5 ${inputClass}`} />
            </div>
          </div>
          <Toggle checked={draft.pickMenu} onChange={(v) => set('pickMenu', v)} label="Menu para abrir um resultado debaixo das pesquisas" />
          <div>
            <Label>Quando o site não responde</Label>
            <div className="mt-1.5">
              <EmojiTextInput value={draft.offlineText} onChange={(v) => set('offlineText', v)} emojis={emojis} maxLength={500} />
            </div>
          </div>
          <div>
            <Label>Quando não encontra nada</Label>
            <div className="mt-1.5">
              <EmojiTextInput value={draft.notFoundText} onChange={(v) => set('notFoundText', v)} emojis={emojis} maxLength={500} />
            </div>
          </div>
          <details className="rounded-lg border border-border bg-black/20 px-3 py-2 text-xs text-muted">
            <summary className="cursor-pointer text-faint">Avançado — endereços</summary>
            <div className="mt-3 grid grid-cols-1 gap-3">
              <div>
                <Label>API do LisFilms</Label>
                <input value={draft.apiUrl} onChange={(e) => set('apiUrl', e.target.value)} className={`mt-1.5 font-mono ${inputClass}`} />
              </div>
              <div>
                <Label>Site</Label>
                <input value={draft.siteUrl} onChange={(e) => set('siteUrl', e.target.value)} className={`mt-1.5 font-mono ${inputClass}`} />
              </div>
            </div>
          </details>
          {error && <p className="text-xs text-danger">❌ {error}</p>}
        </Card>
      </div>

      {/* ---- Embeds ---- */}
      <Card className="flex flex-col gap-4">
        <SectionTitle
          icon={Palette}
          title="Embeds das respostas"
          subtitle="Título, texto, cor hex, imagem, rodapé e {barra} — por servidor."
          action={
            guilds.length > 1 ? (
              <select value={guildId} onChange={(e) => setGuildId(e.target.value)} className={`max-w-xs ${inputClass}`}>
                {guilds.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            ) : undefined
          }
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.kind}
              type="button"
              disabled={!guildId}
              onClick={() => setEditing(t)}
              className="flex flex-col gap-1 rounded-xl border border-border bg-black/20 p-4 text-left transition-colors hover:border-accent/50 disabled:opacity-40"
            >
              <Palette size={16} className="text-accent" />
              <p className="mt-1 text-sm font-bold text-text">{t.title}</p>
              <p className="text-[11px] text-faint">{t.tokens.length} tokens</p>
            </button>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-faint">
          <Users size={12} /> As respostas saem em formato caixa, com o botão para o site lá dentro.
        </p>
      </Card>

      {editing && (
        <TemplateEditorModal
          open
          onClose={() => setEditing(null)}
          kind={editing.kind}
          guildId={guildId}
          isRemote={isRemote}
          title={`Personalizar — ${editing.title}`}
          hint={editing.hint}
          tokens={editing.tokens}
          previewPlaceholders={{ ...editing.values, servidor: guilds.find((g) => g.id === guildId)?.name ?? '' }}
        />
      )}
    </div>
  )
}
