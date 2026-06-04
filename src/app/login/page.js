'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false
    })

    setLoading(false)
    if (res?.error) {
      setError('Email hoặc mật khẩu không đúng')
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-vs-gray-light">
      {/* Top red bar */}
      <div className="h-1 bg-vs-red w-full" />
      
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Logo area */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-3">
              <div className="w-10 h-10 bg-vs-red rounded flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
              <span className="text-2xl font-bold text-vs-dark font-montserrat tracking-tight">VIETSAFE E&C</span>
            </div>
            <p className="text-sm text-vs-gray-mid font-montserrat">
              Hệ thống Tra cứu Tiêu chuẩn PCCC
            </p>
          </div>

          {/* Login card */}
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-lg font-semibold text-vs-dark mb-6 font-montserrat text-center">
              ĐĂNG NHẬP
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-vs-red">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-vs-gray mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="vs-input"
                  placeholder="email@vnsec.com.vn"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-vs-gray mb-1">Mật khẩu</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="vs-input"
                  placeholder="••••••••"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="vs-btn-primary w-full text-center disabled:opacity-50"
              >
                {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="text-center mt-6 text-xs text-vs-gray-mid font-montserrat">
            <p className="font-medium italic">&quot;YOUR SAFETY – OUR SUCCESS&quot;</p>
            <p className="mt-1">www.vnsec.com.vn • info@vnsec.com.vn</p>
          </div>
        </div>
      </div>
    </div>
  )
}
