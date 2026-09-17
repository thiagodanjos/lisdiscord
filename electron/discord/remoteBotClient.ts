// Cliente HTTP para a API remota do bot autónomo (ver server/httpApi.ts) — usado pelo processo
// principal da app desktop para gerir configurações contra o bot que está mesmo a correr num
// servidor, em vez de a app abrir a sua própria ligação separada à Discord.

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
    throw new Error(`Não consegui contactar o bot remoto em ${url} — confirma o endereço, a porta e a firewall.\n${err instanceof Error ? err.message : String(err)}`)
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
  }
}
