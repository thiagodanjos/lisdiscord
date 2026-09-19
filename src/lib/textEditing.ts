export interface TextSelection {
  start: number
  end: number
}

export function wrapSelection(value: string, sel: TextSelection, before: string, after: string): { value: string; selection: TextSelection } {
  const selected = value.slice(sel.start, sel.end)
  const placeholder = selected || 'texto'
  const newValue = value.slice(0, sel.start) + before + placeholder + after + value.slice(sel.end)
  return { value: newValue, selection: { start: sel.start + before.length, end: sel.start + before.length + placeholder.length } }
}

export function insertAtSelection(value: string, sel: TextSelection, text: string): { value: string; selection: TextSelection } {
  const newValue = value.slice(0, sel.start) + text + value.slice(sel.end)
  const pos = sel.start + text.length
  return { value: newValue, selection: { start: pos, end: pos } }
}

export function emojiTag(emoji: { name: string; id: string; animated: boolean }): string {
  return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
}
