import { projects } from '@/data/mock'
import ProjectClient from './client'

export function generateStaticParams() {
  return projects.map(p => ({ id: p.id }))
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = projects.find(p => p.id === id) ?? projects[0]
  return <ProjectClient project={project} />
}
