'use client'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const roleLabels = {
  admin: 'Quản trị viên',
  editor: 'Biên tập viên',
  viewer: 'Người xem'
}

export default function Header() {
  const { data: session } = useSession()
  const router = useRouter()

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="h-1 bg-vs-red w-full" />
      <div className="flex items-center justify-between px-4 py-3">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-vs-red rounded flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-vs-dark font-montserrat leading-tight">VIETSAFE E&C</h1>
            <p className="text-[10px] text-vs-gray-mid font-montserrat leading-tight">Tra cứu Tiêu chuẩn PCCC</p>
          </div>
        </div>

        {/* Nav links */}
        <div className="hidden sm:flex items-center gap-1">
          <button onClick={() => router.push('/dashboard')}
            className="text-xs px-3 py-1.5 text-vs-gray-mid hover:text-vs-red hover:bg-red-50 rounded transition">
            💬 Hỏi đáp
          </button>
          <button onClick={() => router.push('/project-check')}
            className="text-xs px-3 py-1.5 text-vs-gray-mid hover:text-vs-red hover:bg-red-50 rounded transition">
            📋 Kiểm tra dự án
          </button>
          {['admin', 'engineer'].includes(session?.user?.role) && (
            <button onClick={() => router.push('/newsletter')}
              className="text-xs px-3 py-1.5 text-vs-gray-mid hover:text-vs-red hover:bg-red-50 rounded transition">
              📰 Bản tin
            </button>
          )}
        </div>

        {/* User info */}
        <div className="flex items-center gap-3">
          {['admin', 'editor'].includes(session?.user?.role) && (
            <button
              onClick={() => router.push('/admin')}
              className="text-xs px-3 py-1.5 border border-vs-red text-vs-red rounded hover:bg-red-50 transition font-medium"
            >
              {session?.user?.role === 'admin' ? 'Quản trị' : 'Upload VB'}
            </button>
          )}
          <div className="text-right">
            <p className="text-sm font-medium text-vs-gray leading-tight">{session?.user?.name}</p>
            <p className="text-[10px] text-vs-gray-mid leading-tight">{roleLabels[session?.user?.role] || session?.user?.role}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs px-3 py-1.5 bg-gray-100 text-vs-gray rounded hover:bg-gray-200 transition"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  )
}
