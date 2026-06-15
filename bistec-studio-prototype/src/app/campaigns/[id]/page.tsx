import { campaigns } from '@/data/mock'
import CampaignDetailClient from './client'

export function generateStaticParams() {
  return campaigns.map(c => ({ id: c.id }))
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CampaignDetailClient id={id} />
}
