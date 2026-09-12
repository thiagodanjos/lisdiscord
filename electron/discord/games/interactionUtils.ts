import type { ChatInputCommandInteraction, MessageEditOptions, ModalSubmitInteraction } from 'discord.js'

/**
 * `ModalSubmitInteraction.update()` só existe quando a modal foi aberta a
 * partir de um componente de mensagem (sempre o nosso caso, já que só
 * mostramos modais em resposta a cliques em botões) — mas o TypeScript só
 * sabe disso depois deste type guard, daí este pequeno wrapper.
 */
export async function updateFromModal(
  submitted: ModalSubmitInteraction,
  parent: ChatInputCommandInteraction,
  payload: MessageEditOptions,
): Promise<void> {
  if (submitted.isFromMessage()) {
    await submitted.update(payload)
  } else {
    await parent.editReply(payload)
  }
}
