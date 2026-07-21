import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { resolveApiKey } from './auth'
import { createBrandKit, setBrandKitPrompt, uploadBrandTemplate, listBrandKits, getBrandKit } from './tools/brandkit'
import { generatePost, getDraft } from './tools/generate'
import { publishPost } from './tools/publish'
import { env } from '@/lib/env'

// The credential PRESENTED by this MCP process — resolved against the
// ApiKey table (Task 13) on every call rather than once at startup, since a
// key can be revoked mid-session and each call should see that immediately.
const API_KEY = env.MCP_API_KEY ?? null

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
  // Task 13: the admin/non-admin two-tier split is gone — a single resolved
  // ApiKey grants that key's team the full tool surface (tools that used to
  // require an admin-tier key now just need any valid key).
  const key = await resolveApiKey(API_KEY)

  const authRequired = () => ({
    content: [{ type: 'text' as const, text: 'Authentication required — set MCP_API_KEY to a valid, non-revoked team API key' }],
    isError: true,
  })

  try {
    if (!key) return authRequired()

    switch (name) {
      case 'create_brand_kit':
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(
              await createBrandKit({ ...(args as unknown as Omit<Parameters<typeof createBrandKit>[0], 'teamId'>), teamId: key.teamId })
            ),
          }],
        }

      case 'set_brand_kit_prompt':
        return { content: [{ type: 'text', text: JSON.stringify(await setBrandKitPrompt(args as Parameters<typeof setBrandKitPrompt>[0])) }] }

      case 'upload_brand_template':
        return { content: [{ type: 'text', text: JSON.stringify(await uploadBrandTemplate(args as Parameters<typeof uploadBrandTemplate>[0])) }] }

      case 'list_brand_kits':
        return { content: [{ type: 'text', text: JSON.stringify(await listBrandKits()) }] }

      case 'get_brand_kit':
        return { content: [{ type: 'text', text: JSON.stringify(await getBrandKit(args as Parameters<typeof getBrandKit>[0])) }] }

      case 'generate_post':
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(
              await generatePost({ ...(args as unknown as Omit<Parameters<typeof generatePost>[0], 'teamId'>), teamId: key.teamId })
            ),
          }],
        }

      case 'get_draft':
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(
              await getDraft({ ...(args as unknown as Omit<Parameters<typeof getDraft>[0], 'teamId'>), teamId: key.teamId })
            ),
          }],
        }

      case 'publish_post':
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(
              await publishPost({ ...(args as Parameters<typeof publishPost>[0]), teamId: key.teamId })
            ),
          }],
        }

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
