import { campaigns } from '@/data/mock'
import CampaignClient from './client'

export function generateStaticParams() {
  return campaigns.map(c => ({ id: c.id }))
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = campaigns.find(c => c.id === id) ?? campaigns[0]
  return <CampaignClient campaign={campaign} />
}
