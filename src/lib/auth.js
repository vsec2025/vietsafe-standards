import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { getUser } from './redis'

// Danh sách cho phép (allowlist) chính là các bản ghi `user:<email>` trong Redis.
// Admin thêm/xoá email qua trang Quản trị → chỉ email có trong danh sách mới đăng nhập được.
export function normalizeEmail(email) {
  return (email || '').trim().toLowerCase()
}

async function getAllowedUser(email) {
  const key = normalizeEmail(email)
  if (!key) return null
  const data = await getUser(key)
  if (!data) return null
  return typeof data === 'string' ? JSON.parse(data) : data
}

const providers = []

// Google chỉ được bật khi đã cấu hình OAuth credentials
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { prompt: 'select_account' } },
    })
  )
}

// Đăng nhập mật khẩu — giữ làm phương án dự phòng cho tài khoản đã có sẵn mật khẩu.
// Tài khoản do admin thêm mới (không đặt mật khẩu) chỉ đăng nhập được bằng Google.
providers.push(
  CredentialsProvider({
    name: 'Credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Mật khẩu', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null

      const user = await getAllowedUser(credentials.email)
      if (!user || !user.password) return null

      const isValid = await compare(credentials.password, user.password)
      if (!isValid) return null

      return {
        id: user.email,
        email: user.email,
        name: user.name,
        role: user.role,
      }
    },
  })
)

export const authOptions = {
  providers,
  callbacks: {
    // Chặn mọi email không nằm trong allowlist do admin quản lý
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        if (profile?.email_verified === false) return false
        const allowed = await getAllowedUser(user.email)
        if (!allowed) return false // NextAuth chuyển hướng về /login?error=AccessDenied
      }
      return true
    },

    async jwt({ token, user }) {
      // Khi đăng nhập: lấy role từ Redis (Google không cung cấp role)
      if (user?.email) {
        const record = await getAllowedUser(user.email)
        token.email = normalizeEmail(user.email)
        token.role = record?.role ?? 'viewer'
        token.name = record?.name || user.name || token.email
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email
        session.user.role = token.role
        session.user.name = token.name
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
}
