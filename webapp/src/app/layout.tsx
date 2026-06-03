import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'VIETSAFE Standards — Hệ thống Tiêu chuẩn & Quy chuẩn',
  description: 'Tra cứu và hỏi đáp tiêu chuẩn PCCC — Công ty Cổ Phần VIETSAFE E&C',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
