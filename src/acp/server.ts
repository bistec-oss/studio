// ACP server — HTTP-based adapter over the T28 MCP tool layer.
// Exposes bistec-studio as a peer agent following the Agent Communication Protocol
// pattern: GET /api/acp/manifest returns the agent descriptor;
// POST /api/acp/run dispatches named capability calls.
// Auth matches the MCP server: X-Bistec-Api-Key header checked against BISTEC_ADMIN_API_KEYS.

export { AGENT_MANIFEST } from './agent'
