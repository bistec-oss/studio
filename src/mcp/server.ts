import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { isAdminKey, hasAnyKey } from './auth'
import { createBrandKit, setBrandKitPrompt, uploadBrandTemplate, listBrandKits, getBrandKit } from './tools/brandkit'
import { generatePost, getDraft } from './tools/generate'
import { publishPost } from './tools/publish'

const API_KEY = process.env.MCP_API_KEY ?? null

const server = new Server(
  { name: 'bistec-studio', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'create_brand_kit',
      description: 'Admin: create a new brand kit with colors, fonts, and logo.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          colors: { type: 'array', items: { type: 'string' } },
          fonts: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, url: { type: 'string' } }, required: ['name', 'url'] } },
          logoUrl: { type: 'string' },
        },
        required: ['name'],
      },
    },
    {
      name: 'set_brand_kit_prompt',
      description: 'Admin: set or update the brand voice prompt for a brand kit (creates new version).',
      inputSchema: {
        type: 'object',
        properties: {
          brandKitId: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['brandKitId', 'content'],
      },
    },
    {
      name: 'upload_brand_template',
      description: 'Admin: upload an HTML/CSS template string to a brand kit.',
      inputSchema: {
        type: 'object',
        properties: {
          brandKitId: { type: 'string' },
          name: { type: 'string' },
          htmlTemplate: { type: 'string' },
        },
        required: ['brandKitId', 'name', 'htmlTemplate'],
      },
    },
    {
      name: 'list_brand_kits',
      description: 'List all active brand kits.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_brand_kit',
      description: 'Get full details of a brand kit including templates and active prompt.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'generate_post',
      description: 'Generate a social media post from a brief. Returns draftId, exportUrl, and htmlContent.',
      inputSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          goal: { type: 'string' },
          tone: { type: 'string' },
          channels: { type: 'array', items: { type: 'string' } },
          designMode: { type: 'string', enum: ['TEMPLATE', 'GENERATE'] },
          copyProviderKey: { type: 'string' },
          campaignId: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['topic', 'goal', 'tone', 'channels', 'designMode'],
      },
    },
    {
      name: 'get_draft',
      description: 'Get draft details by ID.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'publish_post',
      description: 'Publish a draft to Instagram or LinkedIn.',
      inputSchema: {
        type: 'object',
        properties: {
          draftId: { type: 'string' },
          channel: { type: 'string', enum: ['INSTAGRAM', 'LINKEDIN'] },
        },
        required: ['draftId', 'channel'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const admin = isAdminKey(API_KEY)
  const authenticated = hasAnyKey(API_KEY)

  const adminOnly = () => ({ content: [{ type: 'text' as const, text: 'Admin access required — set BISTEC_ADMIN_API_KEYS and MCP_API_KEY' }], isError: true })
  const authRequired = () => ({ content: [{ type: 'text' as const, text: 'Authentication required — set MCP_API_KEY' }], isError: true })

  try {
    switch (name) {
      case 'create_brand_kit':
        if (!admin) return adminOnly()
        return { content: [{ type: 'text', text: JSON.stringify(await createBrandKit(args as Parameters<typeof createBrandKit>[0])) }] }

      case 'set_brand_kit_prompt':
        if (!admin) return adminOnly()
        return { content: [{ type: 'text', text: JSON.stringify(await setBrandKitPrompt(args as Parameters<typeof setBrandKitPrompt>[0])) }] }

      case 'upload_brand_template':
        if (!admin) return adminOnly()
        return { content: [{ type: 'text', text: JSON.stringify(await uploadBrandTemplate(args as Parameters<typeof uploadBrandTemplate>[0])) }] }

      case 'list_brand_kits':
        if (!authenticated) return authRequired()
        return { content: [{ type: 'text', text: JSON.stringify(await listBrandKits()) }] }

      case 'get_brand_kit':
        if (!authenticated) return authRequired()
        return { content: [{ type: 'text', text: JSON.stringify(await getBrandKit(args as Parameters<typeof getBrandKit>[0])) }] }

      case 'generate_post':
        if (!authenticated) return authRequired()
        return { content: [{ type: 'text', text: JSON.stringify(await generatePost(args as unknown as Parameters<typeof generatePost>[0])) }] }

      case 'get_draft':
        if (!authenticated) return authRequired()
        return { content: [{ type: 'text', text: JSON.stringify(await getDraft(args as Parameters<typeof getDraft>[0])) }] }

      case 'publish_post':
        if (!authenticated) return authRequired()
        return { content: [{ type: 'text', text: JSON.stringify(await publishPost(args as Parameters<typeof publishPost>[0])) }] }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
