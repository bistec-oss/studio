import { drafts } from '@/data/mock'
import DraftClient from './client'

export function generateStaticParams() {
  return drafts.map(d => ({ id: d.id }))
}

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DraftClient id={id} />
}
