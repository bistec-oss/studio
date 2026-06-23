const ADMIN_KEYS = (process.env.BISTEC_ADMIN_API_KEYS ?? '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean)

export function isAdminKey(apiKey: string | null | undefined): boolean {
  if (!apiKey) return false
  return ADMIN_KEYS.includes(apiKey)
}

export function hasAnyKey(apiKey: string | null | undefined): boolean {
  return Boolean(apiKey?.trim())
}
