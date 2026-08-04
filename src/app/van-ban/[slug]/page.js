import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDocument } from '@/lib/documents'
import Header from '@/components/Header'
import DocReader from '@/components/DocReader'

export default async function DocumentPage({ params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const doc = await getDocument(decodeURIComponent(params.slug))
  if (!doc) notFound()

  return (
    <div className="min-h-screen bg-vs-gray-light">
      <Header />
      <div className="max-w-6xl mx-auto p-4">
        <Link href="/dashboard" className="text-xs text-vs-red hover:underline">
          ← Quay lại tra cứu
        </Link>
        <div className="mt-3">
          <DocReader doc={doc} />
        </div>
      </div>
    </div>
  )
}
