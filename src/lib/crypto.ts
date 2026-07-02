import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { env } from '@/lib/env'

const ALG = 'aes-256-gcm'

// Validated lazily (not at module load) so a dev server without a real key
// still boots until encrypt/decrypt is first used. Production fails fast at
// startup instead — see the assertions in src/lib/env.ts.
function getKey(): Buffer {
  const hex = env.TOKEN_ENCRYPTION_KEY
  if (!hex || hex === 'your-32-byte-hex-key') {
    throw new Error('TOKEN_ENCRYPTION_KEY env var is not set or still uses the placeholder value')
  }
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  }
  return key
}

// Encrypted format: iv(12 bytes) + authTag(16 bytes) + ciphertext — base64 encoded
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALG, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decrypt(encryptedBase64: string): string {
  const key = getKey()
  const buf = Buffer.from(encryptedBase64, 'base64')
  // iv(12) + authTag(16) = 28 bytes of framing before any ciphertext.
  if (buf.length < 28) {
    throw new Error('Failed to decrypt value')
  }
  try {
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const ciphertext = buf.subarray(28)
    const decipher = createDecipheriv(ALG, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    // Don't leak the underlying GCM/auth-tag error to callers.
    throw new Error('Failed to decrypt value')
  }
}
