import { projects } from '@/data/mock'
import ProjectDetailClient from './client'

export function generateStaticParams() {
  return projects.map(p => ({ id: p.id }))
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProjectDetailClient id={id} />
}
