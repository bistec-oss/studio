// 031 FR-09, FR-11: the one prefix detector and the personal image key rule.
import { describe, it, expect } from 'vitest'
import { detectKeyProvider, validImageKey, KEY_PROVIDER_LABEL } from '@/providers/keyPrefix'

const OPENAI = 'sk-' + 'a'.repeat(24)
const GEMINI = 'AIza' + 'b'.repeat(35)

describe('detectKeyProvider', () => {
  it('returns anthropic, openai, gemini and null for the four prefix classes', () => {
    expect(detectKeyProvider('sk-ant-api03-xyz')).toBe('anthropic')
    expect(detectKeyProvider('sk-proj-abc')).toBe('openai')
    expect(detectKeyProvider('AIzaSyExample')).toBe('gemini')
    expect(detectKeyProvider('hello-world')).toBeNull()
  })

  it('checks sk-ant- before sk-', () => {
    expect(detectKeyProvider('sk-ant-')).toBe('anthropic')
    expect(detectKeyProvider('sk-an')).toBe('openai')
  })

  it('is case-sensitive and anchored at the start', () => {
    expect(detectKeyProvider('aiza123')).toBeNull()
    expect(detectKeyProvider(' sk-abc')).toBeNull()
    expect(detectKeyProvider('xsk-abc')).toBeNull()
  })

  it('labels each provider in one place', () => {
    expect(KEY_PROVIDER_LABEL).toEqual({
      anthropic: 'Claude (Anthropic)',
      openai: 'OpenAI',
      gemini: 'Gemini (Google)',
    })
  })
})

describe('validImageKey', () => {
  it('accepts a well-formed OpenAI key (sk-, sk-proj-) and a well-formed Gemini key', () => {
    expect(validImageKey(OPENAI)).toBe('openai')
    expect(validImageKey('sk-proj-' + 'Z9_-'.repeat(8))).toBe('openai')
    expect(validImageKey(GEMINI)).toBe('gemini')
  })

  it('refuses an Anthropic key, a random string, a short key and a malformed AIza key', () => {
    expect(validImageKey('sk-ant-' + 'a'.repeat(30))).toBeNull()
    expect(validImageKey('just a random string')).toBeNull()
    expect(validImageKey('sk-short')).toBeNull()
    expect(validImageKey('AIza' + 'b'.repeat(10))).toBeNull()
    expect(validImageKey('AIza' + 'b'.repeat(35) + '!')).toBeNull()
    expect(validImageKey('')).toBeNull()
  })
})
