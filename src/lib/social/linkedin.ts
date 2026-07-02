import { PublishError } from "./types"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { MOCK_SOCIAL, shouldMockPublishFail } from "@/lib/testHooks"
import { env } from "@/lib/env"

async function resolveCredentials(): Promise<{ accessToken: string; organizationId: string }> {
  const row = await prisma.channelToken.findUnique({ where: { channel: "LINKEDIN" } })
  if (row) {
    return { accessToken: decrypt(row.encryptedToken), organizationId: decrypt(row.encryptedMetadata) }
  }
  const accessToken = env.LINKEDIN_ACCESS_TOKEN
  const organizationId = env.LINKEDIN_ORGANIZATION_ID
  if (!accessToken || !organizationId) {
    throw new Error("LinkedIn credentials not configured — set them in Admin → Settings → Social Channels or via env vars")
  }
  return { accessToken, organizationId }
}

interface RegisterUploadResponse {
  value: {
    asset: string
    uploadMechanism: {
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
        uploadUrl: string
        headers: Record<string, string>
      }
    }
  }
}

export async function publish(
  exportUrl: string,
  copyText: string,
): Promise<{ platformId: string }> {
  // Test seam: skip the LinkedIn UGC flow. The failure path (MOCK_SOCIAL_FAIL
  // global, or a __FAIL_ALWAYS__/__FAIL_ONCE__ sentinel in the caption) drives
  // FAILED/retry coverage deterministically.
  if (MOCK_SOCIAL) {
    if (shouldMockPublishFail(copyText)) throw new PublishError("LINKEDIN", "Mock LinkedIn publish failure")
    return { platformId: `mock-linkedin-${Date.now()}` }
  }

  const { accessToken, organizationId } = await resolveCredentials()

  const organizationUrn = `urn:li:organization:${organizationId}`

  // Step 1: Register image asset upload
  const registerResponse = await fetch(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: organizationUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    },
  )

  if (!registerResponse.ok) {
    let reason: string
    try {
      const body = (await registerResponse.json()) as { message?: string }
      reason = body?.message ?? `HTTP ${registerResponse.status}`
    } catch {
      reason = `HTTP ${registerResponse.status}`
    }
    throw new PublishError("LINKEDIN", `Failed to register image upload: ${reason}`)
  }

  const registerBody = (await registerResponse.json()) as RegisterUploadResponse
  const asset = registerBody?.value?.asset
  const uploadInfo =
    registerBody?.value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ]

  if (!asset || !uploadInfo?.uploadUrl) {
    throw new PublishError(
      "LINKEDIN",
      "Register upload response is missing asset or uploadUrl",
    )
  }

  // Step 2: Fetch image bytes and upload to LinkedIn
  const imageResponse = await fetch(exportUrl)
  if (!imageResponse.ok) {
    throw new PublishError(
      "LINKEDIN",
      `Failed to fetch image from exportUrl: HTTP ${imageResponse.status}`,
    )
  }

  const imageBytes = await imageResponse.arrayBuffer()

  const uploadResponse = await fetch(uploadInfo.uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      ...uploadInfo.headers,
    },
    body: imageBytes,
  })

  if (!uploadResponse.ok) {
    throw new PublishError(
      "LINKEDIN",
      `Failed to upload image bytes: HTTP ${uploadResponse.status}`,
    )
  }

  // Step 3: Create UGC post
  const ugcPostBody = {
    author: organizationUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: copyText },
        shareMediaCategory: "IMAGE",
        media: [
          {
            status: "READY",
            description: { text: "" },
            media: asset,
            title: { text: "" },
          },
        ],
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  }

  const postResponse = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(ugcPostBody),
  })

  if (!postResponse.ok) {
    let reason: string
    try {
      const body = (await postResponse.json()) as { message?: string }
      reason = body?.message ?? `HTTP ${postResponse.status}`
    } catch {
      reason = `HTTP ${postResponse.status}`
    }
    throw new PublishError("LINKEDIN", `Failed to create UGC post: ${reason}`)
  }

  const platformId = postResponse.headers.get("x-restli-id")
  if (!platformId) {
    throw new PublishError(
      "LINKEDIN",
      "UGC post response did not include x-restli-id header",
    )
  }

  return { platformId }
}
