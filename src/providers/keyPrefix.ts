// The one place that reads a provider's key prefix (031 FR-09). Pure and
// client-safe: no imports from server code. The admin providers route, the
// personal image key route and the /team page all decide from this.

export type KeyProvider = 'anthropic' | 'openai' | 'gemini'

// The order matters: `sk-ant-` is checked before `sk-`.
export function detectKeyProvider(key: string): KeyProvider | null {
  if (key.startsWith('sk-ant-')) return 'anthropic'
  if (key.startsWith('sk-')) return 'openai'
  if (key.startsWith('AIza')) return 'gemini'
  return null
}

export const KEY_PROVIDER_LABEL: Record<KeyProvider, string> = {
  anthropic: 'Claude (Anthropic)',
  openai: 'OpenAI',
  gemini: 'Gemini (Google)',
}

const OPENAI_KEY_RE = /^sk-(?!ant-)[A-Za-z0-9_-]{20,}$/
const GEMINI_KEY_RE = /^AIza[0-9A-Za-z_-]{30,}$/

// FR-11: the provider a personal image key may be stored for, or null when the
// key is not a well-formed OpenAI or Gemini key (an Anthropic key, a random
// string, a malformed AIza key). Never defaults.
export function validImageKey(key: string): 'openai' | 'gemini' | null {
  const detected = detectKeyProvider(key)
  if (detected === 'openai' && OPENAI_KEY_RE.test(key)) return 'openai'
  if (detected === 'gemini' && GEMINI_KEY_RE.test(key)) return 'gemini'
  return null
}
