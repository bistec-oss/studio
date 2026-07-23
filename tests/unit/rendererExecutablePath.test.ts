// resolveExecutablePath robustness (prod blocker B3, 2026-07-23): a configured
// PUPPETEER_EXECUTABLE_PATH that doesn't exist on disk must NOT be handed to
// puppeteer verbatim (that failed prod with "Browser was not found at the
// configured executablePath"). Instead fall back to autodetection across Linux
// + Windows (Chrome/Edge) candidates. pickExecutablePath is the pure core;
// `exists` and `candidates` are injected so the test is deterministic.

import { describe, it, expect, vi } from 'vitest'
import { pickExecutablePath } from '@/lib/renderer/puppeteer'

const CANDIDATES = [
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]

describe('pickExecutablePath', () => {
  it('returns the configured path when it exists', () => {
    const exists = vi.fn((p: string) => p === '/opt/chrome')
    expect(pickExecutablePath('/opt/chrome', exists, CANDIDATES)).toBe('/opt/chrome')
  })

  it('does NOT return a configured path that does not exist — falls back to an existing candidate', () => {
    // This is the B3 scenario: env points at a chrome.exe that is not installed.
    const missing = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    const exists = vi.fn(
      (p: string) => p === 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    )
    const chosen = pickExecutablePath(missing, exists, CANDIDATES)
    expect(chosen).toBe('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
    expect(chosen).not.toBe(missing)
  })

  it('autodetects the first existing candidate when nothing is configured', () => {
    const exists = vi.fn((p: string) => p === '/usr/bin/chromium-browser')
    expect(pickExecutablePath(undefined, exists, CANDIDATES)).toBe('/usr/bin/chromium-browser')
  })

  it('throws a clear error when neither the configured path nor any candidate exists', () => {
    const exists = vi.fn(() => false)
    expect(() => pickExecutablePath('/nope', exists, CANDIDATES)).toThrow(/Chromium/i)
  })
})
