import { PublishError } from "./types"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { MOCK_SOCIAL, shouldMockPublishFail } from "@/lib/testHooks"

async function resolveCredentials(): Promise<{ accessToken: string; businessAccountId: string }> {
  const row = await prisma.channelToken.findUnique({ where: { channel: "INSTAGRAM" } })
  if (row) {
    return { accessToken: decrypt(row.encryptedToken), businessAccountId: decrypt(row.encryptedMetadata) }
  }
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
  const businessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  if (!accessToken || !businessAccountId) {
    throw new Error("Instagram credentials not configured — set them in Admin → Settings → Social Channels or via env vars")
  }
  return { accessToken, businessAccountId }
}

export async function publish(
  exportUrl: string,
  copyText: string,
): Promise<{ platformId: string }> {
  // Test seam: skip the Graph API round-trip. The failure path (MOCK_SOCIAL_FAIL
  // global, or a __FAIL_ALWAYS__/__FAIL_ONCE__ sentinel in the caption) drives
  // FAILED/retry coverage deterministically.
  if (MOCK_SOCIAL) {
    if (shouldMockPublishFail(copyText)) throw new PublishError("INSTAGRAM", "Mock Instagram publish failure")
    return { platformId: `mock-instagram-${Date.now()}` }
  }

  const { accessToken, businessAccountId } = await resolveCredentials()

  const baseUrl = `https://graph.facebook.com/v19.0/${businessAccountId}`

  // Pass the token via the Authorization header (Graph API accepts Bearer auth)
  // rather than in the request body, so it doesn't land in request logs.
  const authHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Bearer ${accessToken}`,
  }

  // Step 1: Create media container
  const createParams = new URLSearchParams({
    image_url: exportUrl,
    caption: copyText,
  })

  const createResponse = await fetch(`${baseUrl}/media`, {
    method: "POST",
    headers: authHeaders,
    body: createParams.toString(),
  })

  if (!createResponse.ok) {
    let reason: string
    try {
      const body = (await createResponse.json()) as {
        error?: { message?: string }
      }
      reason = body?.error?.message ?? `HTTP ${createResponse.status}`
    } catch {
      reason = `HTTP ${createResponse.status}`
    }
    throw new PublishError("INSTAGRAM", `Failed to create media container: ${reason}`)
  }

  const createBody = (await createResponse.json()) as { id?: string }
  const containerId = createBody.id
  if (!containerId) {
    throw new PublishError(
      "INSTAGRAM",
      "Media container response did not include an id field",
    )
  }

  // Step 2: Publish the media container
  const publishParams = new URLSearchParams({
    creation_id: containerId,
  })

  const publishResponse = await fetch(`${baseUrl}/media_publish`, {
    method: "POST",
    headers: authHeaders,
    body: publishParams.toString(),
  })

  if (!publishResponse.ok) {
    let reason: string
    try {
      const body = (await publishResponse.json()) as {
        error?: { message?: string }
      }
      reason = body?.error?.message ?? `HTTP ${publishResponse.status}`
    } catch {
      reason = `HTTP ${publishResponse.status}`
    }
    throw new PublishError("INSTAGRAM", `Failed to publish media: ${reason}`)
  }

  const publishBody = (await publishResponse.json()) as { id?: string }
  const platformId = publishBody.id
  if (!platformId) {
    throw new PublishError(
      "INSTAGRAM",
      "Media publish response did not include an id field",
    )
  }

  return { platformId }
}
