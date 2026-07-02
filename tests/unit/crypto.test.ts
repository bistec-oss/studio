import { describe, it, expect } from 'vitest'

// crypto.ts reads TOKEN_ENCRYPTION_KEY via src/lib/env.ts, which snapshots
// process.env at module load — so the key must be set BEFORE the import.
// (env.ts only hard-fails on missing keys when NODE_ENV === 'production';
// vitest runs as NODE_ENV=test, and crypto.ts validates the key lazily.)
process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64) // valid 64-char hex → 32 bytes

const { encrypt, decrypt } = await import('@/lib/crypto')

describe('encrypt/decrypt', () => {
  it('round-trips plaintext', () => {
    const secret = 'sk-ant-api03-super-secret-key-🔑'
    expect(decrypt(encrypt(secret))).toBe(secret)
  })

  it('round-trips the empty string', () => {
    expect(decrypt(encrypt(''))).toBe('')
  })

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const a = encrypt('same-plaintext')
    const b = encrypt('same-plaintext')
    expect(a).not.toBe(b)
    // ...but both decrypt to the original
    expect(decrypt(a)).toBe('same-plaintext')
    expect(decrypt(b)).toBe('same-plaintext')
  })

  it('detects tampering (GCM auth tag) and throws the sanitized error', () => {
    const encrypted = encrypt('tamper-me')
    const buf = Buffer.from(encrypted, 'base64')
    buf[buf.length - 1] ^= 0xff // flip a ciphertext bit
    expect(() => decrypt(buf.toString('base64'))).toThrow('Failed to decrypt value')
  })

  it('rejects payloads too short to contain iv + auth tag', () => {
    expect(() => decrypt(Buffer.from('short').toString('base64'))).toThrow(
      'Failed to decrypt value',
    )
  })
})
