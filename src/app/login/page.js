'use client'
import { Suspense, useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

const AUTH_ERRORS = {
  AccessDenied:
    'Email này chưa được cấp quyền truy cập. Vui lòng liên hệ quản trị viên để được thêm vào danh sách cho phép.',
  OAuthAccountNotLinked: 'Tài khoản Google chưa được liên kết. Liên hệ quản trị viên.',
  Configuration: 'Hệ thống chưa cấu hình đăng nhập Google. Liên hệ quản trị viên.',
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')
  const shownError = error || (urlError ? AUTH_ERRORS[urlError] || 'Đăng nhập không thành công.' : '')

  // Chỉ hiện nút Google khi server đã cấu hình GOOGLE_CLIENT_ID/SECRET
  useEffect(() => {
    fetch('/api/auth/providers')
      .then(r => r.json())
      .then(p => setGoogleEnabled(Boolean(p?.google)))
      .catch(() => setGoogleEnabled(false))
  }, [])

  function handleGoogle() {
    setGoogleLoading(true)
    signIn('google', { callbackUrl: '/dashboard' })
  }

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

            {shownError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-vs-red">
                {shownError}
              </div>
            )}

            {/* Đăng nhập bằng Google — phương thức chính */}
            {googleEnabled && (
            <>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded bg-white text-sm font-medium text-vs-dark hover:bg-gray-50 transition disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z"/>
                <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 010-4.22V7.05H2.18a11 11 0 000 9.9l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 00-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z"/>
              </svg>
              {googleLoading ? 'Đang chuyển tới Google...' : 'Đăng nhập bằng Google'}
            </button>

            <p className="mt-3 text-center text-xs text-vs-gray-mid">
              Chỉ email đã được quản trị viên cấp quyền mới đăng nhập được.
            </p>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-vs-gray-mid">hoặc dùng mật khẩu</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            </>
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

// useSearchParams cần Suspense boundary khi build tĩnh (Next.js App Router)
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-vs-gray-light" />}>
      <LoginForm />
    </Suspense>
  )
}
