export async function apiFetch<T = unknown>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? body.error ?? res.statusText)
  }
  return (res.status === 204 ? null : res.json()) as Promise<T>
}
