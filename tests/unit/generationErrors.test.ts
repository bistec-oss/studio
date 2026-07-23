// humanizeGenerationError (prod fix 2026-07-23): generation runs fire-and-forget
// and records failures on Draft.failureReason for the inline error card. Raw
// exception text (e.g. puppeteer's "Browser was not found at the configured
// executablePath (...)") is opaque to a marketer — map known infra failures to
// clear, actionable messages; pass anything unrecognized through unchanged.

import { describe, it, expect } from 'vitest'
import { humanizeGenerationError } from '@/lib/agent/generationErrors'

describe('humanizeGenerationError', () => {
  it('maps a missing browser (puppeteer launch) to a rendering-unavailable message', () => {
    const msg = humanizeGenerationError(
      new Error('Browser was not found at the configured executablePath (C:\\...\\chrome.exe)')
    )
    expect(msg).toMatch(/rendering is unavailable/i)
    expect(msg).toMatch(/browser/i)
  })

  it('maps the resolver "Chromium not found" error too', () => {
    expect(humanizeGenerationError(new Error('Chromium not found. Install Google Chrome ...'))).toMatch(
      /rendering is unavailable/i
    )
  })

  it('maps a missing Claude credential to a connect-token message', () => {
    expect(humanizeGenerationError(new Error('No Claude credential available — connect a personal token'))).toMatch(
      /claude (token|credential)/i
    )
  })

  it('maps a missing COPY provider to an AI-not-configured message', () => {
    expect(humanizeGenerationError(new Error('No COPY provider configured — set ANTHROPIC_API_KEY ...'))).toMatch(
      /ai (copy )?provider/i
    )
  })

  it('maps a timeout to a try-again message', () => {
    expect(humanizeGenerationError(new Error('Claude CLI timed out after 300000ms'))).toMatch(/timed out/i)
  })

  it('passes an unrecognized Error message through unchanged', () => {
    expect(humanizeGenerationError(new Error('some novel failure'))).toBe('some novel failure')
  })

  it('stringifies a non-Error value', () => {
    expect(humanizeGenerationError('boom')).toBe('boom')
  })
})
