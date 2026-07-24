import { describe, it, expect } from 'vitest'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildPathBSystemPrompt, buildPathBUserMessage } from '@/lib/agent/prompts/pathB'
import { buildPathASystemPrompt, buildPathAUserMessage } from '@/lib/agent/prompts/pathA'
import { buildCopyPrompt } from '@/lib/agent/prompts/copy'
import { placeholderNote } from '@/lib/agent/prompts/shared'

const kit: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Bistec',
  colors: ['#0f2d4e', '#ff5a1f'],
  fonts: [{ name: 'Inter', url: 'https://fonts.example.com/inter.woff2' }],
  logoUrl: 'https://cdn.example.com/logo.svg',
  logos: [{ label: 'Primary logo', url: 'https://cdn.example.com/logo.svg', primary: true }],
  voicePrompt: 'Warm, confident, human.',
  source: 'system',
}

describe('buildPathBSystemPrompt', () => {
  it('is pure — same input, same output', () => {
    const opts = { kit, mode: 'api' as const, width: 1080, height: 1080 }
    expect(buildPathBSystemPrompt(opts)).toBe(buildPathBSystemPrompt(opts))
  })

  it('api mode instructs the tool-use loop (renderHtml)', () => {
    const prompt = buildPathBSystemPrompt({ kit, mode: 'api', width: 1080, height: 1350 })
    expect(prompt).toContain('renderHtml(html, 1080, 1350)')
    expect(prompt).not.toContain('NO tools')
  })

  it('cli mode is single-shot: no tools + DOCTYPE protocol', () => {
    const prompt = buildPathBSystemPrompt({ kit, mode: 'cli', width: 1080, height: 1080 })
    expect(prompt).toContain('NO tools')
    expect(prompt).toContain('<!DOCTYPE html>')
    expect(prompt).not.toContain('renderHtml')
  })

  it('embeds the brand kit context and canvas size', () => {
    const prompt = buildPathBSystemPrompt({ kit, mode: 'cli', width: 1080, height: 1350 })
    expect(prompt).toContain('#0f2d4e')
    expect(prompt).toContain('Inter')
    expect(prompt).toContain('https://cdn.example.com/logo.svg')
    expect(prompt).toContain('1080×1350')
  })

  it('filters data: URIs out of the brand reference image list', () => {
    const prompt = buildPathBSystemPrompt({
      kit,
      mode: 'cli',
      width: 1080,
      height: 1080,
      artifactUrls: [
        'https://cdn.example.com/ref-1.png',
        `data:image/png;base64,${'A'.repeat(1000)}`,
        'https://cdn.example.com/ref-2.png',
      ],
    })
    expect(prompt).toContain('Brand reference images: https://cdn.example.com/ref-1.png, https://cdn.example.com/ref-2.png')
    expect(prompt).not.toContain('data:')
  })

  it('omits the reference-image line entirely when only data: URIs remain', () => {
    const prompt = buildPathBSystemPrompt({
      kit,
      mode: 'cli',
      width: 1080,
      height: 1080,
      artifactUrls: ['data:image/png;base64,AAAA'],
    })
    expect(prompt).not.toContain('Brand reference images')
    expect(prompt).not.toContain('data:')
  })

  it('includes the style-reference template line only when provided', () => {
    const withRef = buildPathBSystemPrompt({
      kit,
      mode: 'cli',
      width: 1080,
      height: 1080,
      referenceTemplateHtml: '<div>__INLINE_ASSET_0__</div>',
    })
    expect(withRef).toContain('Style reference')
    const withoutRef = buildPathBSystemPrompt({ kit, mode: 'cli', width: 1080, height: 1080 })
    expect(withoutRef).not.toContain('Style reference')
  })
})

describe('buildPathBUserMessage', () => {
  const base = {
    topic: 'Product launch',
    description: 'Big day',
    goal: 'Awareness',
    tone: 'Excited',
    channels: ['INSTAGRAM', 'LINKEDIN'],
    copyText: 'We are live!',
    width: 1080,
    height: 1080,
  }

  it('api mode ends with a renderHtml call instruction', () => {
    const msg = buildPathBUserMessage({ ...base, mode: 'api' })
    expect(msg).toContain('Call renderHtml(html, 1080, 1080)')
  })

  it('cli mode asks for the HTML document instead', () => {
    const msg = buildPathBUserMessage({ ...base, mode: 'cli' })
    expect(msg).toContain('Output the complete HTML document.')
    expect(msg).not.toContain('renderHtml')
  })
})

describe('buildPathASystemPrompt — placeholderNote wiring', () => {
  it('mentions inline-asset placeholders only when hasInlineAssets', () => {
    const withAssets = buildPathASystemPrompt({
      kit,
      mode: 'cli',
      width: 1080,
      height: 1080,
      hasInlineAssets: true,
    })
    expect(withAssets).toContain('__INLINE_ASSET_0__')

    const withoutAssets = buildPathASystemPrompt({
      kit,
      mode: 'cli',
      width: 1080,
      height: 1080,
      hasInlineAssets: false,
    })
    expect(withoutAssets).not.toContain('__INLINE_ASSET_0__')
  })

  it('placeholderNote itself is empty when there are no inline assets', () => {
    expect(placeholderNote(false)).toBe('')
    expect(placeholderNote(true)).toContain('__INLINE_ASSET_0__')
  })
})

describe('buildPathAUserMessage', () => {
  const base = {
    slimTemplate: '<div class="card">{{TITLE}}</div>',
    copyText: 'Hello world',
    width: 1080,
    height: 1350,
  }

  it('embeds the template and copy; mode selects the final step', () => {
    const api = buildPathAUserMessage({ ...base, mode: 'api' })
    expect(api).toContain('<div class="card">{{TITLE}}</div>')
    expect(api).toContain('Hello world')
    expect(api).toContain('renderHtml(html, 1080, 1350)')

    const cli = buildPathAUserMessage({ ...base, mode: 'cli' })
    expect(cli).toContain('Output the complete filled HTML document.')
    expect(cli).not.toContain('renderHtml')
  })

  it('includes the user image note only when a URL is provided', () => {
    const withImg = buildPathAUserMessage({
      ...base,
      mode: 'cli',
      additionalImageUrl: 'https://cdn.example.com/photo.jpg',
    })
    expect(withImg).toContain('https://cdn.example.com/photo.jpg')
    const withoutImg = buildPathAUserMessage({ ...base, mode: 'cli' })
    expect(withoutImg).not.toContain('User-provided image URL')
  })
})

describe('buildCopyPrompt', () => {
  const brief = {
    topic: 'Hiring push',
    description: 'We are growing',
    goal: 'Applications',
    tone: 'Friendly',
    channels: ['INSTAGRAM', 'LINKEDIN'],
  }

  it('is pure and embeds the brief fields', () => {
    expect(buildCopyPrompt(brief)).toEqual(buildCopyPrompt(brief))
    const { system, user } = buildCopyPrompt(brief)
    expect(system).toContain('INSTAGRAM, LINKEDIN')
    expect(user).toContain('Hiring push')
    expect(user).toContain('Friendly')
  })

  it('uses the brand name and voice when provided, generic fallback otherwise', () => {
    const branded = buildCopyPrompt({ ...brief, brandName: 'Bistec', brandVoice: 'Bold voice.' })
    expect(branded.system).toContain('copywriter for Bistec')
    expect(branded.system).toContain('Bold voice.')

    const generic = buildCopyPrompt(brief)
    expect(generic.system).toContain('copywriter for the brand')
    expect(generic.system).not.toContain('Brand voice guidelines')
  })
})
