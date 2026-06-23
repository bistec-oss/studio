import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import type { CopyProvider } from "./interfaces/CopyProvider"
import type { ImageProvider } from "./interfaces/ImageProvider"
import { OpenAICopyProvider } from "./implementations/copy/openai"
import { OpenAIImageProvider } from "./implementations/image/openai"

function instantiateCopyProvider(providerName: string, apiKey: string): CopyProvider {
  switch (providerName.toLowerCase()) {
    case "openai":
      return new OpenAICopyProvider(apiKey)
    default:
      throw new Error(`Unsupported provider: ${providerName}`)
  }
}

function instantiateImageProvider(providerName: string, apiKey: string): ImageProvider {
  switch (providerName.toLowerCase()) {
    case "openai":
      return new OpenAIImageProvider(apiKey)
    default:
      throw new Error(`Unsupported provider: ${providerName}`)
  }
}

export async function resolveCopyProvider(providerKey?: string): Promise<CopyProvider> {
  if (providerKey) {
    const record = await prisma.availableProvider.findFirst({
      where: { slot: "COPY", providerKey, isEnabled: true },
    })
    if (record) {
      return instantiateCopyProvider(record.providerName, decrypt(record.encryptedApiKey))
    }
  }

  const defaultRecord = await prisma.availableProvider.findFirst({
    where: { slot: "COPY", isDefault: true, isEnabled: true },
  })
  if (defaultRecord) {
    return instantiateCopyProvider(
      defaultRecord.providerName,
      decrypt(defaultRecord.encryptedApiKey)
    )
  }

  const envKey = process.env.OPENAI_API_KEY
  if (!envKey) {
    throw new Error("No COPY provider found and OPENAI_API_KEY env var is not set")
  }
  return new OpenAICopyProvider(envKey)
}

export async function resolveImageProvider(providerKey?: string): Promise<ImageProvider> {
  if (providerKey) {
    const record = await prisma.availableProvider.findFirst({
      where: { slot: "IMAGE", providerKey, isEnabled: true },
    })
    if (record) {
      return instantiateImageProvider(record.providerName, decrypt(record.encryptedApiKey))
    }
  }

  const defaultRecord = await prisma.availableProvider.findFirst({
    where: { slot: "IMAGE", isDefault: true, isEnabled: true },
  })
  if (defaultRecord) {
    return instantiateImageProvider(
      defaultRecord.providerName,
      decrypt(defaultRecord.encryptedApiKey)
    )
  }

  const envKey = process.env.OPENAI_API_KEY
  if (!envKey) {
    throw new Error("No IMAGE provider found and OPENAI_API_KEY env var is not set")
  }
  return new OpenAIImageProvider(envKey)
}
