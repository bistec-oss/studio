import { PublishError } from "./types"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it before calling the LinkedIn publisher.`,
    )
  }
  return value
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
  const accessToken = requireEnv("LINKEDIN_ACCESS_TOKEN")
  const organizationId = requireEnv("LINKEDIN_ORGANIZATION_ID")

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
