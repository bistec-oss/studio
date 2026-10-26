// ACP agent manifest — describes bistec-studio's capabilities to peer agents
import { CaptionStatus } from '@prisma/client'
import { CAPTION_CHANNELS } from '@/lib/channels'
import { activeStyles } from '@/lib/postStyles'

// 018 FR-01: the advertised output must match what `generatePost`
// (src/mcp/tools/generate.ts) returns; tests/unit/mcpGetDraft.test.ts fails on
// any drift in the key set. The version is semver: a minor bump per additive
// change to a capability's schema.
export const AGENT_MANIFEST = {
  name: 'bistec-studio',
  description: 'On-brand social media post generation and publishing for Instagram and LinkedIn.',
  version: '1.2.0',
  capabilities: [
    {
      name: 'generate_post',
      description: 'Generate a complete, on-brand social media post (HTML design + copy) from a brief.',
      input: {
        type: 'object',
        required: ['topic', 'channels', 'designMode'],
        properties: {
          topic: { type: 'string', description: 'Post subject or headline' },
          postStyle: {
            type: 'string',
            enum: activeStyles().map((s) => s.key),
            description:
              'The kind of post (default: general, or the campaign default). An unknown value is an error.',
          },
          goal: {
            type: 'string',
            description:
              'Legacy. Picks a style (hiring or announcement) only when no postStyle is given; ignored otherwise.',
          },
          tone: {
            type: 'string',
            description: 'Optional voice/tone (e.g. professional, casual). Defaults from the post style.',
          },
          channels: {
            type: 'array',
            items: { type: 'string', enum: ['INSTAGRAM', 'LINKEDIN'] },
            description: 'Target channels',
          },
          designMode: {
            type: 'string',
            enum: ['TEMPLATE', 'GENERATE'],
            description: 'TEMPLATE fills a brand template; GENERATE creates a new design',
          },
          description: { type: 'string', description: 'Additional context for the post' },
          campaignId: { type: 'string', description: 'Campaign ID for brand kit resolution' },
        },
      },
      output: {
        type: 'object',
        properties: {
          draftId: { type: 'string' },
          exportUrl: { type: 'string' },
          htmlContent: { type: 'string' },
          postStyle: { type: 'string', description: 'The post style key that was used' },
          factsCheck: {
            type: ['object', 'null'],
            description:
              'Numbers, dates and times in the headline or captions that the brief does not state; null if never checked',
            properties: {
              status: { type: 'string', enum: ['clear', 'flagged', 'error'] },
              flagged: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    kind: { type: 'string' },
                    value: { type: 'string' },
                    where: { type: 'string' },
                  },
                },
              },
            },
          },
          headline: {
            type: ['string', 'null'],
            description: 'The on-image headline (at most 100 characters); null if it was never written',
          },
          captions: {
            type: 'array',
            description: 'One caption per registry channel, in registry order (Instagram and LinkedIn)',
            items: {
              type: 'object',
              required: ['channel', 'text', 'status'],
              properties: {
                channel: { type: 'string', enum: CAPTION_CHANNELS.map((s) => s.channel) },
                text: { type: 'string' },
                status: { type: 'string', enum: Object.values(CaptionStatus) },
              },
            },
          },
        },
      },
    },
    {
      name: 'publish_post',
      description: 'Publish a generated draft to Instagram or LinkedIn.',
      input: {
        type: 'object',
        required: ['draftId', 'channel'],
        properties: {
          draftId: { type: 'string' },
          channel: { type: 'string', enum: ['INSTAGRAM', 'LINKEDIN'] },
        },
      },
      output: {
        type: 'object',
        properties: {
          platformId: { type: 'string' },
        },
      },
    },
  ],
}
