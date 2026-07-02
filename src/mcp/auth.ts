import { env } from '@/lib/env'

function parseKeys(envVar: string | undefined): string[] {
  return (envVar ?? '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean)
}

const ADMIN_KEYS = parseKeys(env.BISTEC_ADMIN_API_KEYS)
// Non-admin keys allowed to call read / generate / publish capabilities.
const API_KEYS = parseKeys(env.BISTEC_API_KEYS)

export function isAdminKey(apiKey: string | null | undefined): boolean {
  if (!apiKey) return false
  return ADMIN_KEYS.includes(apiKey)
}

// A key is valid if it matches a configured admin OR non-admin allow-list entry.
// Replaces the former hasAnyKey(), which accepted ANY non-empty string and left
// the ACP/MCP generate_post + publish_post capabilities open to the internet.
export function isValidKey(apiKey: string | null | undefined): boolean {
  if (!apiKey) return false
  return ADMIN_KEYS.includes(apiKey) || API_KEYS.includes(apiKey)
}
