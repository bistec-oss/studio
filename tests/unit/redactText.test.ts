import { describe, it, expect } from 'vitest'
import { redactText } from '@/lib/text/redact'
import { redactSkipDetail } from '@/lib/drafts/backgroundNotice'

describe('redactText (006 FR-03, moved from backgroundNotice)', () => {
  it('removes urls, keys, key= pairs and host:port', () => {
    expect(redactText('GET https://api.example.com/v1?key=abc failed')).toBe('GET <url> failed')
    expect(redactText('bad key sk-abc123XYZ here')).toBe('bad key <redacted> here')
    expect(redactText('bad AIzaSyD-abc_123 here')).toBe('bad <redacted> here')
    expect(redactText('api_key=hunter2&x=1')).toBe('api_key=<redacted>&x=1')
    expect(redactText('connect ECONNREFUSED 10.0.0.5:9000')).toBe('connect ECONNREFUSED <host>')
    expect(redactText('minio:9000 down')).toBe('<host> down')
  })

  it('leaves ordinary text alone', () => {
    expect(redactText('The model returned no document.')).toBe('The model returned no document.')
  })

  it('is what redactSkipDetail re-exports', () => {
    expect(redactSkipDetail).toBe(redactText)
  })
})
