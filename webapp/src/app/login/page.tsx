'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', {
      username, password, redirect: false,
    })
    setLoading(false)
    if (res?.ok) router.push('/')
    else setError('Tên đăng nhập hoặc mật khẩu không đúng')
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
        {/* Header đỏ */}
        <div className="bg-[#C8102E] p-6 text-white text-center">
          <div className="text-2xl font-bold tracking-wide">VIETSAFE E&C</div>
          <div className="text-sm mt-1 opacity-90">Hệ thống Tiêu chuẩn & Quy chuẩn PCCC</div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên đăng nhập</label>
            <input
              type="text" value={username} onChange={e => setUsername(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="username@vnsec.com.vn" required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="••••••••" required
            />
          </div>
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <button
            type="submit" disabled={loading}
            className="w-full bg-[#C8102E] hover:bg-[#a00d24] text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-60"
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
        
        <div className="px-8 pb-6 text-center text-xs text-gray-400">
          YOUR SAFETY – OUR SUCCESS
        </div>
      </div>
    </div>
  )
}
