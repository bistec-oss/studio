/**
 * A failed response, with its status and the body's `code` and `field` when it
 * sent them (e.g. 008's 400 `MODEL_NOT_ALLOWED` with `field: 'designModel'`),
 * so a caller can place the message on the field it belongs to. Still an
 * Error: `e.message` is unchanged.
 */
export class ApiError extends Error {
  status: number
  code: string | null
  field: string | null

  constructor(message: string, status: number, code: string | null, field: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.field = field
  }
}

export async function apiFetch<T = unknown>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    // A team-scoped route 409s when the user hasn't picked a team yet
    // (withTeamAuth). Bounce to the chooser instead of surfacing a raw error.
    if (
      res.status === 409 &&
      body &&
      typeof body === 'object' &&
      (body as { code?: string }).code === 'team-choice-required'
    ) {
      if (typeof window !== 'undefined') window.location.href = '/choose-team'
    }
    throw new ApiError(
      body.message ?? body.error ?? res.statusText,
      res.status,
      typeof body.code === 'string' ? body.code : null,
      typeof body.field === 'string' ? body.field : null,
    )
  }
  return (res.status === 204 ? null : res.json()) as Promise<T>
}
