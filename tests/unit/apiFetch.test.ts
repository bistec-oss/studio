import { afterEach, describe, it, expect, vi } from 'vitest'
import { ApiError, apiFetch } from '@/lib/apiFetch'

// apiFetch's failure (008 T15): still an Error with the server's message, now
// carrying the status and the body's `code` and `field` (e.g. 400
// MODEL_NOT_ALLOWED on `designModel`).

const respond = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  )

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('throws an ApiError with the message, status, code and field', async () => {
    respond(400, {
      error: "Opus 5.5 isn't available for template fill",
      code: 'MODEL_NOT_ALLOWED',
      field: 'designModel',
    })
    const e = await apiFetch('/api/briefs').catch((err: unknown) => err)
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toBeInstanceOf(Error)
    expect(e).toMatchObject({
      message: "Opus 5.5 isn't available for template fill",
      status: 400,
      code: 'MODEL_NOT_ALLOWED',
      field: 'designModel',
    })
  })

  it('code and field are null when the body sends none', async () => {
    respond(404, { error: 'Not found' })
    const e = await apiFetch('/api/x').catch((err: unknown) => err)
    expect(e).toMatchObject({ message: 'Not found', status: 404, code: null, field: null })
  })

  it('returns the body on success', async () => {
    respond(200, { id: 'b1' })
    await expect(apiFetch<{ id: string }>('/api/x')).resolves.toEqual({ id: 'b1' })
  })
})
