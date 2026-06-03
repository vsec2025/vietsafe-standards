import bcrypt from 'bcryptjs'
import { getRedis, keys } from './redis'
import { User, UserRole } from '@/types'

export async function createUser(
  username: string,
  password: string,
  role: UserRole,
  displayName: string
): Promise<User> {
  const redis = getRedis()
  const id = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const passwordHash = await bcrypt.hash(password, 12)
  
  const user: User = { id, username, role, displayName, createdAt: new Date().toISOString() }
  
  await Promise.all([
    redis.set(keys.user(id), JSON.stringify({ ...user, passwordHash })),
    redis.set(keys.userByUsername(username), id),
    redis.sadd(keys.allUsers(), id),
  ])
  
  return user
}

export async function verifyUser(username: string, password: string): Promise<User | null> {
  const redis = getRedis()
  const userId = await redis.get<string>(keys.userByUsername(username))
  if (!userId) return null
  
  const userData = await redis.get<any>(keys.user(userId))
  if (!userData) return null
  
  const valid = await bcrypt.compare(password, userData.passwordHash)
  if (!valid) return null
  
  const { passwordHash, ...user } = userData
  return user as User
}

export async function getUserById(id: string): Promise<User | null> {
  const redis = getRedis()
  const userData = await redis.get<any>(keys.user(id))
  if (!userData) return null
  const { passwordHash, ...user } = userData
  return user as User
}

export async function getAllUsers(): Promise<User[]> {
  const redis = getRedis()
  const ids = await redis.smembers(keys.allUsers())
  if (!ids.length) return []
  const users = await Promise.all(ids.map(id => getUserById(id as string)))
  return users.filter(Boolean) as User[]
}

export async function initAdminUser() {
  const redis = getRedis()
  const existing = await redis.get(keys.userByUsername('namnt@vnsec.com.vn'))
  if (!existing) {
    await createUser(
      'namnt@vnsec.com.vn',
      'CongtyVSEC@2025',
      'admin',
      'Nguyễn Thanh Nam'
    )
    console.log('Admin user created')
  }
}
