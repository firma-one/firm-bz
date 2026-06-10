import { redirect } from 'next/navigation'

export default async function ConnectorsRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  redirect(`/d/f/${slug}`)
}
