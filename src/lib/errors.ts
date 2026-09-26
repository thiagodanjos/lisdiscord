/** O Electron embrulha os erros do processo principal em "Error invoking remote method '…': Error: …" — mostra só a mensagem. */
export function cleanIpcError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
