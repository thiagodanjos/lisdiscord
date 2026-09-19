// Cliente HTTP para a API remota do bot autónomo (ver server/httpApi.ts) — usado pelo processo
// principal da app desktop para gerir configurações contra o bot que está mesmo a correr num
// servidor, em vez de a app abrir a sua própria ligação separada à Discord.

// O `fetch` do Node (undici) lança sempre "fetch failed" na mensagem principal — a causa real
// (ligação recusada, ligação interrompida a meio, tempo esgotado, DNS…) fica em `err.cause`, que
// sem isto se perdia por completo, tornando impossível distinguir "o bot caiu" de "a firewall
// está a bloquear" ou "a ligação foi interrompida a meio do pedido" só pela mensagem mostrada.
function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const cause = (err as { cause?: unknown }).cause
  if (cause instanceof Error) {
    const code = (cause as { code?: string }).code
    return code ? `${cause.message} (${code})` : cause.message
  }
  return err.message
}

async function remoteFetch<T>(url: string, apiKey: string, pathname: string, options?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${url.replace(/\/+$/, '')}${pathname}`, {
      method: options?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(options?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch (err) {
    throw new Error(`Não consegui contactar o bot remoto em ${url} — confirma o endereço, a porta e a firewall.\n${describeFetchError(err)}`)
  }

  const text = await res.text().catch(() => '')
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`O bot remoto respondeu com algo inesperado (não é JSON válido): ${text.slice(0, 200)}`)
    }
  }

  if (!res.ok) {
    const message = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : `Erro ${res.status} do bot remoto.`
    throw new Error(message)
  }

  return data as T
}

export interface RemoteBotCredentials {
  url: string
  apiKey: string
}

export async function testRemoteBotConnection(url: string, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await remoteFetch<{ ok?: boolean }>(url, apiKey, '/health')
    if (!data?.ok) return { ok: false, error: 'Resposta inesperada do bot remoto.' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro desconhecido.' }
  }
}

export function remoteApi({ url, apiKey }: RemoteBotCredentials) {
  return {
    listGuilds: <T>() => remoteFetch<T>(url, apiKey, '/api/guilds'),
    listChannels: <T>(guildId: string) => remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/channels`),
    getJustificationSettings: <T>(guildId: string) => remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/justifications`),
    setJustificationChannel: <T>(guildId: string, kind: string, channelId: string | null) =>
      remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/justifications/${kind}`, { method: 'POST', body: { channelId } }),
    listEmojis: <T>() => remoteFetch<T>(url, apiKey, '/api/emojis'),
    addEmoji: <T>(name: string, imageDataUrl: string) =>
      remoteFetch<T>(url, apiKey, '/api/emojis', { method: 'POST', body: { name, imageDataUrl } }),
    deleteEmoji: (id: string) => remoteFetch<void>(url, apiKey, `/api/emojis/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    listMovPoints: <T>(guildId: string) => remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/movpoints`),
    addMovPoints: <T>(guildId: string, userId: string, amount: number) =>
      remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/movpoints/${encodeURIComponent(userId)}/add`, { method: 'POST', body: { amount } }),
    removeMovPoints: <T>(guildId: string, userId: string, amount: number) =>
      remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/movpoints/${encodeURIComponent(userId)}/remove`, { method: 'POST', body: { amount } }),
    addMovHours: <T>(guildId: string, userId: string, seconds: number) =>
      remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/movpoints/${encodeURIComponent(userId)}/hours`, { method: 'POST', body: { seconds } }),
    getMovPointsBoard: <T>(guildId: string) => remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/movpoints/board`),
    setMovPointsBoard: <T>(guildId: string, channelId: string | null) =>
      remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/movpoints/board`, { method: 'POST', body: { channelId } }),
    resetMovPoints: <T>(guildId: string) => remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/movpoints/reset`, { method: 'POST' }),
    listMovPointsLog: <T>(guildId: string) => remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/movpoints/log`),
    listExcludedMembers: <T>(guildId: string) => remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/movpoints/excluded`),
    setMemberExcluded: <T>(guildId: string, userId: string, tag: string, excluded: boolean) =>
      remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/movpoints/excluded/${encodeURIComponent(userId)}`, {
        method: 'POST',
        body: { tag, excluded },
      }),

    searchMembers: <T>(guildId: string, query: string) =>
      remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/members/search?q=${encodeURIComponent(query)}`),
    getMemberProfile: <T>(guildId: string, userId: string) =>
      remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/profile`),
    listRoles: <T>(guildId: string) => remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/roles`),

    listRoleGoals: <T>(guildId: string) => remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/goals`),
    setRoleGoal: <T>(guildId: string, roleId: string, roleName: string, pointsGoal: number, hoursGoal: number) =>
      remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/goals/${encodeURIComponent(roleId)}`, {
        method: 'POST',
        body: { roleName, pointsGoal, hoursGoal },
      }),
    removeRoleGoal: <T>(guildId: string, roleId: string) =>
      remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/goals/${encodeURIComponent(roleId)}`, { method: 'DELETE' }),

    getEmbedTemplate: <T>(guildId: string, kind: string) =>
      remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/embed-templates/${kind}`),
    setEmbedTemplate: <T>(guildId: string, kind: string, draft: unknown) =>
      remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/embed-templates/${kind}`, { method: 'POST', body: { draft } }),
    resetEmbedTemplate: <T>(guildId: string, kind: string) =>
      remoteFetch<T>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/embed-templates/${kind}`, { method: 'DELETE' }),

    sendEmbed: (guildId: string, channelId: string, draft: unknown) =>
      remoteFetch<void>(url, apiKey, `/api/guilds/${encodeURIComponent(guildId)}/messages`, { method: 'POST', body: { channelId, draft } }),
  }
}
