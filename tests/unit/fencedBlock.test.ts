// 007 AC-18: one fenced-block extractor, and extractBrandKitBlock keeps today's
// results. The brand-kit fixtures were pinned against the pre-rewrite function
// and are unchanged by the rewrite.
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { extractFencedJson } from '@/lib/agent/fencedBlock'
import { extractBrandKitBlock } from '@/lib/brandkit/assistant'

const schema = z.object({ n: z.number() })

describe('extractFencedJson', () => {
  it('returns ok with the data', () => {
    expect(extractFencedJson('hi\n```t\n{"n":1}\n```', 't', schema)).toEqual({
      ok: true,
      data: { n: 1 },
    })
  })
  it('missing, invalid-json and schema are told apart', () => {
    expect(extractFencedJson('no block', 't', schema)).toEqual({ ok: false, reason: 'missing' })
    expect(extractFencedJson('```t\n\n```', 't', schema)).toEqual({ ok: false, reason: 'missing' })
    expect(extractFencedJson('```t\nnot json\n```', 't', schema)).toEqual({
      ok: false,
      reason: 'invalid-json',
    })
    expect(extractFencedJson('```t\n{"n":"x"}\n```', 't', schema)).toEqual({
      ok: false,
      reason: 'schema',
    })
  })
  it('takes the last block when two exist', () => {
    const text = '```t\n{"n":1}\n```\nthen\n```t\n{"n":2}\n```'
    expect(extractFencedJson(text, 't', schema)).toEqual({ ok: true, data: { n: 2 } })
    // The last block decides: a bad last block is a failure, not a fallback.
    expect(extractFencedJson('```t\n{"n":1}\n```\n```t\nbad\n```', 't', schema)).toEqual({
      ok: false,
      reason: 'invalid-json',
    })
  })
  it('ignores other tags and escapes the tag', () => {
    expect(extractFencedJson('```other\n{"n":1}\n```', 't', schema)).toEqual({
      ok: false,
      reason: 'missing',
    })
    expect(extractFencedJson('```a.b\n{"n":1}\n```', 'a.b', schema)).toEqual({
      ok: true,
      data: { n: 1 },
    })
    expect(extractFencedJson('```axb\n{"n":1}\n```', 'a.b', schema)).toEqual({
      ok: false,
      reason: 'missing',
    })
  })
})

describe('extractBrandKitBlock parity (pinned before the rewrite)', () => {
  it('valid block: fields and defaults', () => {
    expect(
      extractBrandKitBlock('x\n```brandkit\n{"voice":" v ","colors":["#1A2B3C"]}\n```'),
    ).toEqual({
      voice: 'v',
      tone: '',
      style: '',
      fonts: {},
      colors: ['#1A2B3C'],
    })
  })
  it('missing, bad JSON and bad schema are null', () => {
    expect(extractBrandKitBlock('no block')).toBeNull()
    expect(extractBrandKitBlock('```brandkit\nnot json\n```')).toBeNull()
    expect(extractBrandKitBlock('```brandkit\n{"tone":"x"}\n```')).toBeNull()
    expect(extractBrandKitBlock('```brandkit\n{"voice":"v","colors":["blue"]}\n```')).toBeNull()
  })
  it('two blocks: the last wins', () => {
    const text = '```brandkit\n{"voice":"old"}\n```\n```brandkit\n{"voice":"new"}\n```'
    expect(extractBrandKitBlock(text)!.voice).toBe('new')
  })
})
