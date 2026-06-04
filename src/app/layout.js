import './globals.css'
import AuthProvider from '@/components/AuthProvider'

export const metadata = {
  title: 'VIETSAFE E&C — Tra cứu Tiêu chuẩn PCCC',
  description: 'Hệ thống tra cứu tiêu chuẩn phòng cháy chữa cháy — Công ty Cổ Phần VIETSAFE E&C',
}

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-white">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
