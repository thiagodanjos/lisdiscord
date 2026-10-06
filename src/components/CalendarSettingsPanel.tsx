import { useState } from 'react'
import { Bell, LayoutList, MessageSquareText, MousePointerClick, Palette, Plus, ShieldCheck, Siren, Tags, Trash2, X } from 'lucide-react'
import { Button, Card, Toggle } from './ui'
import { EmojiTextInput } from './EmojiTextInput'
import { CustomButtonEditor } from './CustomButtonEditor'
import { REPORT_TIMEZONES } from '../../shared/movFeatures'
import type { BotEmoji, CalendarSettings, ChannelPickerEntry, EmbedTemplateKind, RolePickerEntry } from '../../shared/types'

const inputClass = 'w-full rounded-lg border border-border bg-black/30 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none'

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">{children}</label>
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-faint">{children}</p>
}

function SectionTitle({ icon: Icon, title, subtitle, action }: { icon: typeof Bell; title: string; subtitle: string; action?: React.ReactNode }) {
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

function RoleChips({ roles, selected, onChange }: { roles: RolePickerEntry[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="mt-1.5 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border bg-black/20 p-2">
      {roles.map((r) => {
        const on = selected.includes(r.id)
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(on ? selected.filter((id) => id !== r.id) : [...selected, r.id])}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${on ? 'border-accent bg-accent-soft text-text' : 'border-border text-muted hover:text-text'}`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: r.color === '#000000' ? '#99aab5' : r.color }} />
            {r.name}
            {on && <span>✓</span>}
          </button>
        )
      })}
    </div>
  )
}

function ChannelSelect({ value, onChange, channels, empty }: { value: string | null; onChange: (v: string | null) => void; channels: ChannelPickerEntry[]; empty: string }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={`mt-1.5 ${inputClass}`}>
      <option value="">{empty}</option>
      {channels
        .filter((c) => c.kind === 'text' || c.kind === 'announcement')
        .map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
    </select>
  )
}

const REMINDER_PRESETS = [0, 10, 15, 30, 60, 120, 1440]
const minutesLabel = (m: number) => (m === 0 ? 'na hora' : m < 60 ? `${m} min antes` : m % 1440 === 0 ? `${m / 1440} dia(s) antes` : `${m / 60}h antes`)

type TextKey = {
  [K in keyof CalendarSettings]: CalendarSettings[K] extends string ? K : never
}[keyof CalendarSettings]

const STATUS_TEXTS: { key: TextKey; label: string }[] = [
  { key: 'statusOpen', label: 'Inscrições abertas' },
  { key: 'statusFull', label: 'Vagas esgotadas' },
  { key: 'statusLive', label: 'A decorrer' },
  { key: 'statusDone', label: 'Concluída' },
  { key: 'statusCancelled', label: 'Cancelada' },
]

const REPLY_TEXTS: { key: TextKey; label: string }[] = [
  { key: 'replyJoined', label: 'Confirmou presença' },
  { key: 'replyOrganizing', label: 'Ficou como organizador' },
  { key: 'replyUnavailable', label: 'Marcou indisponível' },
  { key: 'replyLeft', label: 'Saiu' },
  { key: 'replyFull', label: 'Sem vagas' },
  { key: 'replyConflict', label: 'Conflito de horário ({outra} = a outra atividade)' },
  { key: 'replyNoPermission', label: 'Sem permissão (cargo)' },
  { key: 'replyClosed', label: 'Atividade fechada' },
]

const COVER_TEXTS: { key: TextKey; label: string }[] = [
  { key: 'replyOwnerConfirmed', label: 'Dono confirmou' },
  { key: 'replyOwnerDeclined', label: 'Dono disse que não consegue' },
  { key: 'replyTaken', label: 'Supervisor assumiu' },
  { key: 'replyAlreadyTaken', label: 'Já foi assumida ({supervisor})' },
  { key: 'replyNotSupervisor', label: 'Não é supervisor / não é o dono' },
  { key: 'replyCoverClosed', label: 'Atividade já terminou' },
  { key: 'coverReasonDeclined', label: '{motivo}: o dono não pode' },
  { key: 'coverReasonNoAnswer', label: '{motivo}: o dono não respondeu' },
  { key: 'coverReasonNoOwner', label: '{motivo}: sem dono' },
  { key: 'coverReasonManual', label: '{motivo}: pedido pela app' },
]

const COVER_TEMPLATES: { kind: EmbedTemplateKind; label: string }[] = [
  { kind: 'activityOwnerAsk', label: 'DM ao dono' },
  { kind: 'activityOwnerConfirmed', label: 'Dono confirmou' },
  { kind: 'activityOwnerDeclined', label: 'Dono não pode' },
  { kind: 'activityCoverCall', label: 'Chamada aos supervisores' },
  { kind: 'activityCoverTaken', label: 'Assumida' },
  { kind: 'activityCoverUncovered', label: 'Sem supervisor' },
]

export function CalendarSettingsPanel({
  draft,
  setDraft,
  channels,
  roles,
  emojis,
  onEditTemplate,
}: {
  draft: CalendarSettings
  setDraft: (fn: (d: CalendarSettings) => CalendarSettings) => void
  channels: ChannelPickerEntry[]
  roles: RolePickerEntry[]
  emojis: BotEmoji[]
  onEditTemplate: (kind: EmbedTemplateKind) => void
}) {
  const [newReminder, setNewReminder] = useState('')
  const set = <K extends keyof CalendarSettings>(key: K, value: CalendarSettings[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const updateCategory = (i: number, patch: Partial<CalendarSettings['categories'][number]>) =>
    set(
      'categories',
      draft.categories.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    )
  const addReminder = (m: number) => {
    if (!Number.isFinite(m) || m < 0 || draft.reminderMinutes.includes(m) || draft.reminderMinutes.length >= 5) return
    set(
      'reminderMinutes',
      [...draft.reminderMinutes, m].sort((a, b) => b - a),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <SectionTitle icon={LayoutList} title="Canais e painel" subtitle="Onde cada atividade é publicada e o painel com os próximos dias." />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Canal da agenda</Label>
              <ChannelSelect value={draft.channelId} onChange={(v) => set('channelId', v)} channels={channels} empty="Escolhe o canal…" />
              <Hint>Cada atividade vira uma mensagem com os botões.</Hint>
            </div>
            <div>
              <Label>Fuso horário</Label>
              <select value={draft.timezone} onChange={(e) => set('timezone', e.target.value)} className={`mt-1.5 ${inputClass}`}>
                {REPORT_TIMEZONES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Toggle checked={draft.boardEnabled} onChange={(v) => set('boardEnabled', v)} label="Painel com a agenda dos próximos dias (atualiza sozinho)" />
          {draft.boardEnabled && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_7rem]">
              <div>
                <Label>Canal do painel</Label>
                <ChannelSelect value={draft.boardChannelId} onChange={(v) => set('boardChannelId', v)} channels={channels} empty="O mesmo da agenda" />
              </div>
              <div>
                <Label>Dias</Label>
                <input type="number" min={1} max={31} value={draft.boardDays} onChange={(e) => set('boardDays', Number(e.target.value))} className={`mt-1.5 ${inputClass}`} />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="dark" onClick={() => onEditTemplate('activityCard')}>
              <Palette size={14} /> Embed da atividade
            </Button>
            <Button variant="dark" onClick={() => onEditTemplate('activityBoard')}>
              <Palette size={14} /> Embed do painel
            </Button>
            <Button variant="dark" onClick={() => onEditTemplate('activityList')}>
              <Palette size={14} /> Embed do /atividade listar
            </Button>
          </div>
          <Toggle checked={draft.deleteOnCancel} onChange={(v) => set('deleteOnCancel', v)} label="Apagar a mensagem quando a atividade é cancelada (senão fica marcada)" />
        </Card>

        <Card className="flex flex-col gap-4">
          <SectionTitle
            icon={Bell}
            title="Lembretes automáticos"
            subtitle="Para o responsável, organizadores e participantes."
            action={
              <Button variant="dark" onClick={() => onEditTemplate('activityReminder')}>
                <Palette size={14} /> Embed do lembrete
              </Button>
            }
          />
          <div>
            <Label>Quando (até 5)</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {draft.reminderMinutes.map((m) => (
                <span key={m} className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-text">
                  ⏰ {minutesLabel(m)}
                  <button type="button" onClick={() => set('reminderMinutes', draft.reminderMinutes.filter((x) => x !== m))} className="hover:text-danger">
                    <X size={11} />
                  </button>
                </span>
              ))}
              {draft.reminderMinutes.length === 0 && <span className="text-xs text-faint">Sem lembretes.</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {REMINDER_PRESETS.filter((m) => !draft.reminderMinutes.includes(m)).map((m) => (
                <button key={m} type="button" onClick={() => addReminder(m)} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted hover:text-text">
                  + {minutesLabel(m)}
                </button>
              ))}
              <input
                value={newReminder}
                onChange={(e) => setNewReminder(e.target.value.replace(/\D/g, ''))}
                placeholder="min"
                className="w-16 rounded-lg border border-border bg-black/30 px-2 py-1 text-xs text-text"
              />
              <Button
                variant="dark"
                onClick={() => {
                  addReminder(Number(newReminder))
                  setNewReminder('')
                }}
                disabled={!newReminder}
              >
                <Plus size={12} />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>Enviar</Label>
              <select value={draft.reminderTarget} onChange={(e) => set('reminderTarget', e.target.value as CalendarSettings['reminderTarget'])} className={`mt-1.5 ${inputClass}`}>
                <option value="channel">No canal (marca a malta)</option>
                <option value="dm">Por mensagem privada</option>
                <option value="both">Nos dois</option>
              </select>
            </div>
            <div>
              <Label>Canal dos lembretes</Label>
              <ChannelSelect value={draft.reminderChannelId} onChange={(v) => set('reminderChannelId', v)} channels={channels} empty="O da agenda" />
            </div>
            <div>
              <Label>Marcar também</Label>
              <select value={draft.reminderMentionRoleId ?? ''} onChange={(e) => set('reminderMentionRoleId', e.target.value || null)} className={`mt-1.5 ${inputClass}`}>
                <option value="">Nenhum cargo</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    @{r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-4">
        <SectionTitle
          icon={Tags}
          title="Categorias"
          subtitle="Nome, emoji e cor (hex) — a cor é a barra do embed de cada atividade."
          action={
            <Button
              variant="dark"
              onClick={() => set('categories', [...draft.categories, { id: `cat${Date.now().toString(36)}`, name: 'Nova categoria', emoji: '📌', color: '#5865F2' }])}
              disabled={draft.categories.length >= 25}
            >
              <Plus size={14} /> Adicionar
            </Button>
          }
        />
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {draft.categories.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border bg-black/20 p-2" style={{ borderLeft: `4px solid ${c.color}` }}>
              <div className="w-24 shrink-0">
                <EmojiTextInput value={c.emoji} onChange={(v) => updateCategory(i, { emoji: v })} emojis={emojis} maxLength={100} />
              </div>
              <input value={c.name} onChange={(e) => updateCategory(i, { name: e.target.value })} maxLength={40} className={inputClass} />
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#5865f2'} onChange={(e) => updateCategory(i, { color: e.target.value.toUpperCase() })} className="h-9 w-10 shrink-0 cursor-pointer rounded border border-border bg-transparent" />
              <input value={c.color} onChange={(e) => updateCategory(i, { color: e.target.value })} maxLength={7} className="w-24 shrink-0 rounded-lg border border-border bg-black/30 px-2 py-2 font-mono text-xs text-text" />
              <button
                type="button"
                title="Apagar categoria"
                disabled={draft.categories.length <= 1}
                onClick={() => set('categories', draft.categories.filter((_, j) => j !== i))}
                className="shrink-0 rounded-lg border border-border p-2 text-muted hover:text-danger disabled:opacity-30"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="flex flex-col gap-4">
          <SectionTitle icon={ShieldCheck} title="Permissões e conflitos" subtitle="Administradores e quem tem Gerir servidor podem sempre tudo." />
          <div>
            <Label>Quem cria, edita e cancela (/atividade)</Label>
            <RoleChips roles={roles} selected={draft.managerRoleIds} onChange={(ids) => set('managerRoleIds', ids)} />
            <Hint>O responsável de uma atividade também a pode editar/cancelar.</Hint>
          </div>
          <div>
            <Label>Quem pode ser organizador</Label>
            <RoleChips roles={roles} selected={draft.organizerRoleIds} onChange={(ids) => set('organizerRoleIds', ids)} />
            <Hint>{draft.organizerRoleIds.length ? '' : 'Nenhum escolhido → qualquer pessoa.'}</Hint>
          </div>
          <div>
            <Label>Quem pode confirmar presença</Label>
            <RoleChips roles={roles} selected={draft.participantRoleIds} onChange={(ids) => set('participantRoleIds', ids)} />
            <Hint>{draft.participantRoleIds.length ? '' : 'Nenhum escolhido → qualquer pessoa.'}</Hint>
          </div>
          <div>
            <Label>Conflitos de horário entre atividades</Label>
            <select value={draft.conflictMode} onChange={(e) => set('conflictMode', e.target.value as CalendarSettings['conflictMode'])} className={`mt-1.5 ${inputClass}`}>
              <option value="off">Permitir tudo</option>
              <option value="responsible">Bloquear o mesmo responsável à mesma hora</option>
              <option value="location">Bloquear o mesmo responsável ou o mesmo local à mesma hora</option>
              <option value="all">Bloquear qualquer sobreposição (uma atividade de cada vez)</option>
            </select>
          </div>
          <Toggle checked={draft.blockPersonConflicts} onChange={(v) => set('blockPersonConflicts', v)} label="Impedir alguém de se inscrever em duas atividades à mesma hora" />
        </Card>

        <Card className="flex flex-col gap-4">
          <SectionTitle icon={MessageSquareText} title="Linhas e estados" subtitle="Como as listas e o {estado} aparecem." />
          <div>
            <Label>Linha de cada atividade (painel e listar)</Label>
            <input value={draft.boardLineFormat} onChange={(e) => set('boardLineFormat', e.target.value)} maxLength={300} className={`mt-1.5 font-mono ${inputClass}`} />
            <Hint>{'{hora} {data} {emoji} {titulo} {categoria} {responsavel} {vagas} {numero} {estado}'}</Hint>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Cabeçalho de cada dia</Label>
              <input value={draft.boardDayFormat} onChange={(e) => set('boardDayFormat', e.target.value)} maxLength={200} className={`mt-1.5 font-mono ${inputClass}`} />
              <Hint>{'{dia} {data}'}</Hint>
            </div>
            <div>
              <Label>Pessoa nas listas</Label>
              <input value={draft.personLineFormat} onChange={(e) => set('personLineFormat', e.target.value)} maxLength={100} className={`mt-1.5 font-mono ${inputClass}`} />
              <Hint>{'{membro} {nome}'}</Hint>
            </div>
            <div>
              <Label>Agenda vazia</Label>
              <div className="mt-1.5">
                <EmojiTextInput value={draft.boardEmptyText} onChange={(v) => set('boardEmptyText', v)} emojis={emojis} maxLength={300} />
              </div>
            </div>
            <div>
              <Label>Lista de pessoas vazia</Label>
              <div className="mt-1.5">
                <EmojiTextInput value={draft.emptyPeopleText} onChange={(v) => set('emptyPeopleText', v)} emojis={emojis} maxLength={200} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {STATUS_TEXTS.map((f) => (
              <div key={f.key}>
                <Label>{f.label}</Label>
                <div className="mt-1.5">
                  <EmojiTextInput value={draft[f.key] as string} onChange={(v) => set(f.key, v)} emojis={emojis} maxLength={100} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className={`flex flex-col gap-4 ${draft.coverEnabled ? 'border-success/40' : ''}`}>
        <SectionTitle
          icon={Siren}
          title="Dono da mov + supervisores"
          subtitle="Antes de começar, o bot pergunta por DM ao dono (o responsável) se vai conseguir. Se não puder — ou não responder, ou não houver dono — manda DM a todos os supervisores; o primeiro que carregar em Eu assumo fica com a mov e as mensagens mudam para todos."
          action={<Toggle checked={draft.coverEnabled} onChange={(v) => set('coverEnabled', v)} label={draft.coverEnabled ? 'Ligado' : 'Desligado'} />}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label>Perguntar ao dono (min antes)</Label>
            <input type="number" min={5} max={10080} value={draft.coverAskMinutes} onChange={(e) => set('coverAskMinutes', Number(e.target.value))} className={`mt-1.5 ${inputClass}`} />
          </div>
          <div>
            <Label>Sem resposta em (min)</Label>
            <input type="number" min={0} max={10080} value={draft.coverOwnerTimeoutMinutes} onChange={(e) => set('coverOwnerTimeoutMinutes', Number(e.target.value))} className={`mt-1.5 ${inputClass}`} />
            <Hint>Depois disto vai aos supervisores. 0 = espera até à hora de início.</Hint>
          </div>
          <div>
            <Label>Mensagem geral (canal, opcional)</Label>
            <ChannelSelect value={draft.coverChannelId} onChange={(v) => set('coverChannelId', v)} channels={channels} empty="Só por DM" />
          </div>
          <div className="flex flex-col justify-end gap-2">
            <Toggle checked={draft.coverDmSupervisors} onChange={(v) => set('coverDmSupervisors', v)} label="DM a cada supervisor" />
            <Toggle checked={draft.coverMentionRole} onChange={(v) => set('coverMentionRole', v)} label="Marcar o cargo na mensagem geral" />
            <Toggle checked={draft.coverAlertAtStart} onChange={(v) => set('coverAlertAtStart', v)} label="Avisar se começar sem ninguém" />
          </div>
        </div>
        <div>
          <Label>Cargos de supervisor (recebem a DM e podem assumir)</Label>
          <RoleChips roles={roles} selected={draft.supervisorRoleIds} onChange={(ids) => set('supervisorRoleIds', ids)} />
        </div>
        <div>
          <Label>Só nestas categorias (nenhuma = todas)</Label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {draft.categories.map((c) => {
              const on = draft.coverCategoryIds.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => set('coverCategoryIds', on ? draft.coverCategoryIds.filter((x) => x !== c.id) : [...draft.coverCategoryIds, c.id])}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${on ? 'border-accent bg-accent-soft text-text' : 'border-border text-muted hover:text-text'}`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                  {c.emoji} {c.name}
                  {on && <span>✓</span>}
                </button>
              )
            })}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <CustomButtonEditor title="Dono: Vou fazer" value={draft.ownerConfirmButton} fallback="Vou fazer" emojis={emojis} onChange={(v) => set('ownerConfirmButton', v)} />
          <CustomButtonEditor title="Dono: Não vou conseguir" value={draft.ownerDeclineButton} fallback="Não vou conseguir" emojis={emojis} onChange={(v) => set('ownerDeclineButton', v)} />
          <CustomButtonEditor title="Supervisor: Eu assumo" value={{ ...draft.supervisorTakeButton, show: true }} fallback="Eu assumo" emojis={emojis} onChange={(v) => set('supervisorTakeButton', { ...v, show: true })} />
        </div>
        <div className="flex flex-wrap gap-2">
          {COVER_TEMPLATES.map((t) => (
            <Button key={t.kind} variant="dark" onClick={() => onEditTemplate(t.kind)}>
              <Palette size={13} /> {t.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {COVER_TEXTS.map((f) => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <div className="mt-1.5">
                <EmojiTextInput value={draft[f.key] as string} onChange={(v) => set(f.key, v)} emojis={emojis} maxLength={500} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <SectionTitle icon={MousePointerClick} title="Botões de cada atividade" subtitle="Mostrar ou esconder, texto, emoji (normal ou do bot) e cor." />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <CustomButtonEditor title="Confirmar presença" value={draft.joinButton} fallback="Confirmar presença" emojis={emojis} onChange={(v) => set('joinButton', v)} />
          <CustomButtonEditor title="Indisponível" value={draft.unavailableButton} fallback="Indisponível" emojis={emojis} onChange={(v) => set('unavailableButton', v)} />
          <CustomButtonEditor title="Quero organizar" value={draft.organizeButton} fallback="Quero organizar" emojis={emojis} onChange={(v) => set('organizeButton', v)} />
          <CustomButtonEditor title="Sair" value={draft.leaveButton} fallback="Sair" emojis={emojis} onChange={(v) => set('leaveButton', v)} />
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <SectionTitle icon={MessageSquareText} title="Respostas aos botões" subtitle="Só quem clicou vê. {titulo} e {numero} funcionam em todas." />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {REPLY_TEXTS.map((f) => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <div className="mt-1.5">
                <EmojiTextInput value={draft[f.key] as string} onChange={(v) => set(f.key, v)} emojis={emojis} maxLength={500} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
