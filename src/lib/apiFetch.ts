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
    throw new Error(body.message ?? body.error ?? res.statusText)
  }
  return (res.status === 204 ? null : res.json()) as Promise<T>
}
