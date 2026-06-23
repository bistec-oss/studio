// ACP agent manifest — describes bistec-studio's capabilities to peer agents
export const AGENT_MANIFEST = {
  name: 'bistec-studio',
  description: 'On-brand social media post generation and publishing for Instagram and LinkedIn.',
  version: '1.0.0',
  capabilities: [
    {
      name: 'generate_post',
      description: 'Generate a complete, on-brand social media post (HTML design + copy) from a brief.',
      input: {
        type: 'object',
        required: ['topic', 'goal', 'tone', 'channels', 'designMode'],
        properties: {
          topic: { type: 'string', description: 'Post subject or headline' },
          goal: { type: 'string', description: 'Marketing goal or CTA' },
          tone: { type: 'string', description: 'Voice/tone (e.g. professional, casual)' },
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
