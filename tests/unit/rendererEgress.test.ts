// SSRF regression guard (security review item 3): the renderer egress allowlist
// must block cloud-metadata (169.254.169.254) and arbitrary/internal hosts —
// only Google Fonts + our MinIO hosts are reachable from model-generated HTML.
// In unit-test env MINIO_ENDPOINT is unset, so only the two font hosts are
// allowed; that's enough to assert the deny behavior.

import { describe, it, expect } from 'vitest'
import { isAllowedRenderRequest } from '@/lib/renderer/puppeteer'

describe('isAllowedRenderRequest', () => {
  it('blocks the cloud-metadata IP', () => {
    expect(isAllowedRenderRequest('http://169.254.169.254/latest/meta-data/')).toBe(false)
  })

  it('blocks internal / arbitrary hosts not on the allowlist', () => {
    // NB: the configured MinIO host (localhost:9000 in this env) IS allowed by
    // design — it serves embedded assets. These hosts are never on the allowlist.
    expect(isAllowedRenderRequest('http://10.0.0.5/')).toBe(false)
    expect(isAllowedRenderRequest('http://192.168.1.1/')).toBe(false)
    expect(isAllowedRenderRequest('https://evil.example.com/exfil')).toBe(false)
  })

  it('blocks non-http(s) schemes (except in-document data/blob/about:blank)', () => {
    expect(isAllowedRenderRequest('file:///etc/passwd')).toBe(false)
    expect(isAllowedRenderRequest('ftp://host/x')).toBe(false)
    expect(isAllowedRenderRequest('data:image/png;base64,AAAA')).toBe(true)
    expect(isAllowedRenderRequest('about:blank')).toBe(true)
  })

  it('allows Google Fonts (brand @import fonts)', () => {
    expect(isAllowedRenderRequest('https://fonts.googleapis.com/css2?family=Inter')).toBe(true)
    expect(isAllowedRenderRequest('https://fonts.gstatic.com/s/inter/x.woff2')).toBe(true)
  })
})
