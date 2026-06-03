import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { verifyUser } from '@/lib/auth'

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null
        const user = await verifyUser(credentials.username, credentials.password)
        if (!user) return null
        return { id: user.id, name: user.displayName, email: user.username, role: user.role } as any
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.id = user.id; token.role = (user as any).role }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id
        ;(session.user as any).role = token.role
      }
      return session
    },
  },
  pages: { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt', maxAge: 30 * 24 * 3600 },
  secret: process.env.NEXTAUTH_SECRET,
})

export { handler as GET, handler as POST }
